// src/utils/battleCore.js - COMPLETE VERSION WITH UNIFIED EFFECT SYSTEM
import { 
  getToolEffect, 
  getSpellEffect, 
  calculateEffectPower
} from './itemEffects';
import { 
  calculateDamage, 
  calculateDerivedStats, 
  getRarityMultiplier, 
  getFormMultiplier,
  applySynergyModifiers,
  calculateComboBonus,
  checkFieldSynergies
} from './battleCalculations';

// BALANCED: Get maximum energy with reasonable scaling
const getMaxEnergy = (creatures, difficulty = 'medium') => {
  let baseEnergy = 15; // Reduced from 20
  
  // Difficulty-based energy scaling
  switch (difficulty) {
    case 'easy': baseEnergy = 10; break;
    case 'medium': baseEnergy = 12; break;
    case 'hard': baseEnergy = 15; break;
    case 'expert': baseEnergy = 18; break;
  }
  
  // Reduced energy bonus from creature count
  const creatureBonus = Math.floor(creatures.length * 0.25); // Reduced from 0.5
  
  return baseEnergy + creatureBonus;
};

// Helper function to recalculate stats after modifications
const recalculateDerivedStats = (creature) => {
  // Validate input
  if (!creature || !creature.stats) {
    console.error("Cannot recalculate stats for invalid creature:", creature);
    return creature.battleStats || {};
  }

  // Use the same calculation logic as the initial stat calculation
  // FIXED: Skip active effects to avoid double application
  const freshDerivedStats = calculateDerivedStats(creature, [], false, true);
  
  // Apply any active temporary modifications from effects
  const modifiedStats = { ...freshDerivedStats };
  
  if (creature.activeEffects && Array.isArray(creature.activeEffects)) {
    console.log(`recalculateDerivedStats: Applying ${creature.activeEffects.length} effects to ${creature.species_name}`);
    
    creature.activeEffects.forEach(effect => {
      if (effect && effect.statModifications) {
        Object.entries(effect.statModifications).forEach(([stat, value]) => {
          if (modifiedStats[stat] !== undefined) {
            modifiedStats[stat] += value;
            // Ensure stats don't go below reasonable minimums
            if (stat.includes('Attack') || stat.includes('Defense')) {
              modifiedStats[stat] = Math.max(1, modifiedStats[stat]);
            } else if (stat === 'maxHealth') {
              modifiedStats[stat] = Math.max(10, modifiedStats[stat]);
            } else if (stat === 'initiative' || stat.includes('Chance')) {
              modifiedStats[stat] = Math.max(0, modifiedStats[stat]);
            }
          }
        });
      }
    });
  }
  
  // Apply any permanent stat modifications from items, combinations, etc.
  if (creature.permanentModifications) {
    Object.entries(creature.permanentModifications).forEach(([stat, value]) => {
      if (modifiedStats[stat] !== undefined) {
        modifiedStats[stat] += value;
      }
    });
  }
  
  // Apply combination bonuses if present
  if (creature.combination_level && creature.combination_level > 0) {
    const combinationMultiplier = 1 + (creature.combination_level * 0.08); // Reduced from 0.1
    
    // Apply combination bonus to all stats
    Object.keys(modifiedStats).forEach(stat => {
      if (typeof modifiedStats[stat] === 'number' && !stat.includes('Chance') && stat !== 'energyCost') {
        modifiedStats[stat] = Math.round(modifiedStats[stat] * combinationMultiplier);
      }
    });
  }
  
  // Ensure health doesn't exceed max health after recalculation
  if (creature.currentHealth && creature.currentHealth > modifiedStats.maxHealth) {
    creature.currentHealth = modifiedStats.maxHealth;
  }
  
  console.log(`recalculateDerivedStats complete for ${creature.species_name}:`, modifiedStats);
  
  return modifiedStats;
};

// Get description for effect types
const getEffectDescription = (effectType, powerLevel = 'normal') => {
  const descriptions = {
    'Surge': {
      'weak': 'Minor surge of power',
      'normal': 'Surge of enhanced abilities',
      'strong': 'Powerful surge of overwhelming might',
      'maximum': 'Ultimate surge of devastating power'
    },
    'Shield': {
      'weak': 'Basic protective barrier',
      'normal': 'Solid defensive enhancement',
      'strong': 'Powerful defensive fortress',
      'maximum': 'Impenetrable defensive barrier'
    },
    'Echo': {
      'weak': 'Faint repeating effect',
      'normal': 'Resonating enhancement',
      'strong': 'Powerful echoing phenomenon',
      'maximum': 'Overwhelming echo cascade'
    },
    'Drain': {
      'weak': 'Minor energy drain',
      'normal': 'Life force absorption',
      'strong': 'Powerful vampiric drain',
      'maximum': 'Devastating soul drain'
    },
    'Charge': {
      'weak': 'Slow power buildup',
      'normal': 'Steady power accumulation',
      'strong': 'Rapid power concentration',
      'maximum': 'Explosive power convergence'
    }
  };
  
  return descriptions[effectType]?.[powerLevel] || `${effectType.toLowerCase()} effect`;
};

// FIXED: Process a full turn of battle with proper ongoing effect application
export const processTurn = (gameState, difficulty = 'medium') => {
  const newState = {...gameState};
  
  // CRITICAL FIX: Apply ongoing effects BEFORE energy regeneration
  // This ensures damage/healing from spells and tools happens at the start of each turn
  console.log('=== PROCESSING TURN START - APPLYING ONGOING EFFECTS ===');
  
  // Process all creatures together to handle cross-creature effects (like drain spells)
  const allCreatures = [...newState.playerField, ...newState.enemyField];
  const processedCreatures = applyOngoingEffects(allCreatures, difficulty, newState.turn);
  
  // Split back into player and enemy fields
  newState.playerField = processedCreatures.filter(c => 
    newState.playerField.some(pc => pc.id === c.id)
  );
  newState.enemyField = processedCreatures.filter(c => 
    newState.enemyField.some(ec => ec.id === c.id)
  );
  
  // Energy regeneration with balanced scaling
  const maxPlayerEnergy = getMaxEnergy(newState.playerField, difficulty);
  const maxEnemyEnergy = getMaxEnergy(newState.enemyField, difficulty);
  
  newState.playerEnergy = Math.min(
    newState.playerEnergy + calculateEnergyRegen(newState.playerField, difficulty),
    maxPlayerEnergy
  );
  
  newState.enemyEnergy = Math.min(
    newState.enemyEnergy + calculateEnergyRegen(newState.enemyField, difficulty),
    maxEnemyEnergy
  );
  
  // Remove defeated creatures with death effects
  newState.playerField = processDefeatedCreatures(newState.playerField, newState.enemyField);
  newState.enemyField = processDefeatedCreatures(newState.enemyField, newState.playerField);
  
  // Process draw phase with balanced hand limits
  const maxHandSize = getMaxHandSize(difficulty);
  
  if (newState.playerHand.length < maxHandSize && newState.playerDeck.length > 0) {
    const drawnCard = newState.playerDeck[0];
    newState.playerHand.push(drawnCard);
    newState.playerDeck = newState.playerDeck.slice(1);
  }
  
  if (newState.enemyHand.length < maxHandSize && newState.enemyDeck.length > 0) {
    const drawnCard = newState.enemyDeck[0];
    newState.enemyHand.push(drawnCard);
    newState.enemyDeck = newState.enemyDeck.slice(1);
  }
  
  return newState;
};

// BALANCED: Calculate energy regeneration
export const calculateEnergyRegen = (creatures, difficulty = 'medium') => {
  let baseRegen = 3;
  
  // Difficulty-based base regen
  switch (difficulty) {
    case 'easy': baseRegen = 2; break;
    case 'medium': baseRegen = 3; break;
    case 'hard': baseRegen = 4; break;
    case 'expert': baseRegen = 5; break;
  }
  
  // Energy contributions from creatures (reduced scaling)
  const energyContribution = creatures.reduce((total, creature) => {
    if (!creature.stats || !creature.stats.energy) return total;
    
    // Base energy contribution
    let contribution = creature.stats.energy * 0.1; // Reduced from 0.3
    
    // Rarity bonuses (reduced)
    switch (creature.rarity) {
      case 'Legendary': contribution *= 1.3; break;
      case 'Epic': contribution *= 1.2; break;
      case 'Rare': contribution *= 1.1; break;
    }
    
    // Form bonuses
    contribution *= (1 + (creature.form || 0) * 0.05);
    
    return total + contribution;
  }, 0);
  
  // Specialty stat bonuses (reduced)
  const specialtyBonus = creatures.reduce((total, creature) => {
    if (creature.specialty_stats && creature.specialty_stats.includes('energy')) {
      return total + 0.5; // Reduced from 1
    }
    return total;
  }, 0);
  
  return Math.round(baseRegen + energyContribution + specialtyBonus);
};

// Get max hand size based on difficulty
export const getMaxHandSize = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 5;
    case 'medium': return 4;
    case 'hard': return 3;
    case 'expert': return 3;
    default: return 4;
  }
};

// UPDATE applyOngoingEffects to properly handle cross-creature effects
export const applyOngoingEffects = (creatures, difficulty = 'medium', currentTurn = 0) => {
  if (!creatures || !Array.isArray(creatures)) {
    console.error("Invalid creatures array:", creatures);
    return [];
  }

  console.log(`\n=== APPLYING ONGOING EFFECTS - Turn ${currentTurn} ===`);

  const healthChanges = new Map();
  const statModifications = new Map();
  const effectEvents = [];
  
  // Process all creatures' effects
  creatures.forEach(creature => {
    if (!creature || !creature.battleStats) return;
    
    console.log(`Processing effects for ${creature.species_name} (${creature.activeEffects?.length || 0} active)`);
    
    (creature.activeEffects || []).forEach(effect => {
      if (!effect || effect.type === 'defense' || !effect.applyEachTurn) return;
      
      const turnsActive = currentTurn - (effect.startTurn || 0) + 1;
      
      // Skip if effect hasn't started yet (for charge effects)
      if (turnsActive < 1) return;
      
      console.log(`  Effect: ${effect.name}, Turn ${turnsActive}/${effect.duration}`);
      
      // CRITICAL: Use applyFunction for ALL effects (tools and spells)
      if (effect.applyFunction && typeof effect.applyFunction === 'function') {
        // Get the correct caster and target
        let casterCreature = creature;
        let targetCreature = creature;
        
        // For cross-creature effects
        if (effect.crossCreature && effect.casterId && effect.targetId) {
          casterCreature = creatures.find(c => c.id === effect.casterId) || creature;
          targetCreature = creatures.find(c => c.id === effect.targetId) || creature;
          
          // For caster effects, swap the processing
          if (effect.isCasterEffect) {
            // This effect is on the caster but references the target
            const temp = casterCreature;
            casterCreature = targetCreature;
            targetCreature = temp;
          }
        }
        
        // Apply the effect
        const turnEffect = effect.applyFunction(casterCreature, targetCreature, turnsActive);
        
        // Process damage
        if (turnEffect.damage && turnEffect.damage > 0) {
          const targetId = targetCreature.id;
          const current = healthChanges.get(targetId) || { damage: 0, healing: 0 };
          healthChanges.set(targetId, {
            damage: current.damage + turnEffect.damage,
            healing: current.healing
          });
          
          effectEvents.push({
            type: 'damage',
            targetId: targetId,
            amount: turnEffect.damage,
            effectName: effect.name,
            damageType: 'magical'
          });
        }
        
        // Process healing to target
        if (turnEffect.healthOverTime && turnEffect.healthOverTime > 0) {
          const targetId = targetCreature.id;
          const current = healthChanges.get(targetId) || { damage: 0, healing: 0 };
          healthChanges.set(targetId, {
            damage: current.damage,
            healing: current.healing + turnEffect.healthOverTime
          });
          
          effectEvents.push({
            type: 'healing',
            targetId: targetId,
            amount: turnEffect.healthOverTime,
            effectName: effect.name
          });
        }
        
        // Process self-healing (for drain effects)
        if (turnEffect.selfHeal && turnEffect.selfHeal > 0 && effect.crossCreature) {
          const casterId = casterCreature.id;
          const current = healthChanges.get(casterId) || { damage: 0, healing: 0 };
          healthChanges.set(casterId, {
            damage: current.damage,
            healing: current.healing + turnEffect.selfHeal
          });
          
          effectEvents.push({
            type: 'healing',
            targetId: casterId,
            amount: turnEffect.selfHeal,
            effectName: effect.name + ' (Drain)'
          });
        }
        
        // Store stat modifications for this creature
        if (turnEffect.statChanges && Object.keys(turnEffect.statChanges).length > 0) {
          const mods = statModifications.get(targetCreature.id) || {};
          Object.entries(turnEffect.statChanges).forEach(([stat, value]) => {
            mods[stat] = (mods[stat] || 0) + value;
          });
          statModifications.set(targetCreature.id, mods);
        }
        
        // Store self stat modifications (for drain effects)
        if (turnEffect.selfStatChanges && Object.keys(turnEffect.selfStatChanges).length > 0) {
          const mods = statModifications.get(casterCreature.id) || {};
          Object.entries(turnEffect.selfStatChanges).forEach(([stat, value]) => {
            mods[stat] = (mods[stat] || 0) + value;
          });
          statModifications.set(casterCreature.id, mods);
        }
      }
      // Fallback for simple effects without applyFunction
      else if (effect.healthOverTime && effect.healthOverTime !== 0 && effect.applyEachTurn) {
        const healthChange = effect.healthOverTime;
        if (healthChange > 0) {
          const current = healthChanges.get(creature.id) || { damage: 0, healing: 0 };
          healthChanges.set(creature.id, {
            damage: current.damage,
            healing: current.healing + healthChange
          });
          
          effectEvents.push({
            type: 'healing',
            targetId: creature.id,
            amount: healthChange,
            effectName: effect.name,
            healingType: effect.effectType || 'regeneration'
          });
          console.log(`    Healing over time: ${healthChange}`);
        } else {
          const current = healthChanges.get(creature.id) || { damage: 0, healing: 0 };
          healthChanges.set(creature.id, {
            damage: current.damage + Math.abs(healthChange),
            healing: current.healing
          });
          
          effectEvents.push({
            type: 'damage',
            targetId: creature.id,
            amount: Math.abs(healthChange),
            effectName: effect.name,
            damageType: effect.effectType || 'dot'
          });
          console.log(`    Damage over time: ${Math.abs(healthChange)}`);
        }
      }
    });
  });
  
  // Apply all changes
  const processedCreatures = creatures.map(creature => {
    if (!creature || !creature.battleStats) return creature;
    
    const updatedCreature = { ...creature };
    
    // Reset stats to base
    updatedCreature.battleStats = calculateDerivedStats(updatedCreature, [], false, true);
    
    // Apply stat modifications from this turn
    const mods = statModifications.get(creature.id);
    if (mods) {
      Object.entries(mods).forEach(([stat, value]) => {
        if (updatedCreature.battleStats[stat] !== undefined) {
          updatedCreature.battleStats[stat] = Math.max(0, updatedCreature.battleStats[stat] + value);
        }
      });
    }
    
    // Apply health changes
    const changes = healthChanges.get(creature.id);
    if (changes) {
      const netChange = changes.healing - changes.damage;
      if (netChange !== 0) {
        const oldHealth = updatedCreature.currentHealth;
        updatedCreature.currentHealth = Math.min(
          updatedCreature.battleStats.maxHealth,
          Math.max(0, updatedCreature.currentHealth + netChange)
        );
        console.log(`  ${creature.species_name}: ${oldHealth} → ${updatedCreature.currentHealth} HP (${netChange > 0 ? '+' : ''}${netChange})`);
      }
    }
    
    // Update effect durations
    updatedCreature.activeEffects = (updatedCreature.activeEffects || [])
      .map(effect => {
        if (effect.type === 'defense' || !effect.applyEachTurn) return effect;
        return { ...effect, duration: effect.duration - 1 };
      })
      .filter(effect => effect && effect.duration > 0);
    
    // Reset defending status
    if (updatedCreature.isDefending) {
      updatedCreature.isDefending = false;
    }
    
    return updatedCreature;
  });
  
  // Store events for animations
  processedCreatures._effectEvents = effectEvents;
  
  console.log(`=== END ONGOING EFFECTS ===\n`);
  return processedCreatures;
};

// Process defeated creatures and apply death effects
const processDefeatedCreatures = (creatures, opposingCreatures = []) => {
  const survivingCreatures = [];
  
  creatures.forEach(creature => {
    if (creature.currentHealth > 0) {
      survivingCreatures.push(creature);
    } else {
      // Apply balanced death effects based on creature properties
      if (creature.rarity === 'Legendary') {
        console.log(`${creature.species_name} (Legendary) was defeated! Their sacrifice empowers allies!`);
        // Death rattle effect - empower remaining creatures (reduced)
        survivingCreatures.forEach(ally => {
          ally.battleStats.physicalAttack += 2; // Reduced from 3
          ally.battleStats.magicalAttack += 2;  // Reduced from 3
          
          // Add a temporary effect to track this bonus
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: `${creature.species_name}'s Final Gift`,
            icon: '👑',
            type: 'legendary_blessing',
            description: 'Empowered by a fallen legendary creature',
            duration: 5, // Reduced from 999 - now temporary
            statModifications: {
              physicalAttack: 2,
              magicalAttack: 2
            },
            startTurn: ally.currentTurn || 0
          });
        });
      } else if (creature.specialty_stats && creature.specialty_stats.includes('energy')) {
        console.log(`Energy specialist ${creature.species_name} was defeated! Releasing stored energy!`);
        // Energy burst - restore energy to allies
        survivingCreatures.forEach(ally => {
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Energy Release',
            icon: '⚡',
            type: 'energy_burst',
            description: 'Energized by released power',
            duration: 2, // Reduced from 3
            statModifications: {
              energyCost: -1
            },
            startTurn: ally.currentTurn || 0
          });
        });
      } else if (creature.rarity === 'Epic') {
        console.log(`Epic creature ${creature.species_name} was defeated! Their essence lingers!`);
        // Epic death effect - minor stat boost to allies
        survivingCreatures.forEach(ally => {
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Epic Essence',
            icon: '💜',
            type: 'epic_blessing',
            description: 'Blessed by epic essence',
            duration: 3, // Reduced from 5
            statModifications: {
              physicalAttack: 1,
              magicalAttack: 1
            },
            startTurn: ally.currentTurn || 0
          });
        });
      }
      
      // NEW: Revenge mechanic - opposing creatures get minor penalty when defeating strong creatures
      if (creature.rarity === 'Legendary' || creature.rarity === 'Epic') {
        opposingCreatures.forEach(enemy => {
          if (!enemy.activeEffects) enemy.activeEffects = [];
          enemy.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Guilty Conscience',
            icon: '😰',
            type: 'debuff',
            description: 'Shaken by defeating a powerful foe',
            duration: 2,
            statModifications: {
              initiative: -2,
              dodgeChance: -1
            },
            startTurn: enemy.currentTurn || 0
          });
        });
      }
    }
  });
  
  return survivingCreatures;
};

// ENHANCED: Process attack action with combo bonus and proper health tracking
export const processAttack = (attacker, defender, attackType = 'auto', comboLevel = 0) => {
  // Validate input
  if (!attacker || !defender || !attacker.battleStats || !defender.battleStats) {
    console.error('processAttack: Invalid input', { attacker, defender });
    return {
      updatedAttacker: attacker,
      updatedDefender: defender,
      battleLog: "Invalid attack - missing stats",
      damage: 0,
      finalDamage: 0,
      totalDamage: 0,
      damageDealt: 0,
      actualDamage: 0,
      damageResult: { damage: 0, isDodged: false, isCritical: false, effectiveness: 'normal' }
    };
  }
  
  // CRITICAL FIX: Create proper copies without losing health values
  const attackerClone = {
    ...attacker,
    id: attacker.id,
    species_name: attacker.species_name,
    currentHealth: attacker.currentHealth,
    maxHealth: attacker.maxHealth || attacker.health,
    battleStats: { ...attacker.battleStats },
    activeEffects: attacker.activeEffects ? [...attacker.activeEffects] : [],
    form: attacker.form,
    element: attacker.element,
    rarity: attacker.rarity,
    stats: attacker.stats // FIXED: Include base stats for damage calculation
  };
  
  const defenderClone = {
    ...defender,
    id: defender.id,
    species_name: defender.species_name,
    currentHealth: defender.currentHealth,
    maxHealth: defender.maxHealth || defender.health,
    battleStats: { ...defender.battleStats },
    activeEffects: defender.activeEffects ? [...defender.activeEffects] : [],
    form: defender.form,
    element: defender.element,
    rarity: defender.rarity,
    isDefending: defender.isDefending || false,
    stats: defender.stats // FIXED: Include base stats for damage calculation
  };
  
  // CRITICAL LOGGING: Log health values at start
  console.log(`processAttack: ${attackerClone.species_name} (${attackerClone.currentHealth} HP) attacking ${defenderClone.species_name} (${defenderClone.currentHealth} HP)`);
  console.log(`  Defender battleStats:`, defenderClone.battleStats);
  
  // Determine attack type if set to auto
  if (attackType === 'auto') {
    attackType = attackerClone.battleStats.physicalAttack >= attackerClone.battleStats.magicalAttack 
      ? 'physical' 
      : 'magical';
  }
  
  // Apply charge bonuses if available
  if (attackerClone.nextAttackBonus) {
    if (attackType === 'physical') {
      attackerClone.battleStats.physicalAttack += attackerClone.nextAttackBonus;
    } else {
      attackerClone.battleStats.magicalAttack += attackerClone.nextAttackBonus;
    }
    // Consume the bonus
    delete attackerClone.nextAttackBonus;
    console.log(`${attackerClone.species_name} unleashes charged attack!`);
  }
  
  // Calculate combo multiplier
  const comboMultiplier = calculateComboBonus(comboLevel);
  
  // Pass combo multiplier to damage calculation
  const damageResult = calculateDamage(attackerClone, defenderClone, attackType, comboMultiplier);
  
  // Apply damage with additional effects
  let actualDamage = 0;
  if (!damageResult.isDodged) {
    // Store defender's health before damage
    const previousHealth = defenderClone.currentHealth;
    
    // Base damage
    defenderClone.currentHealth = Math.max(0, defenderClone.currentHealth - damageResult.damage);
    
    // Calculate actual damage dealt
    actualDamage = previousHealth - defenderClone.currentHealth;
    
    console.log(`processAttack result: ${actualDamage} damage dealt. ${defenderClone.species_name} health: ${previousHealth} → ${defenderClone.currentHealth}`);
    
    // Critical hit effects (reduced impact)
    if (damageResult.isCritical) {
      // Critical hits may apply additional effects
      if (Math.random() < 0.2) { // Reduced from 0.3
        const bonusEffect = {
          id: Date.now(),
          name: 'Critical Strike Trauma',
          icon: '💥',
          type: 'debuff',
          description: 'Suffering from critical strike',
          duration: 1, // Reduced from 2
          statModifications: {
            physicalDefense: -2, // Reduced from -3
            magicalDefense: -2   // Reduced from -3
          },
          startTurn: defenderClone.currentTurn || 0
        };
        
        defenderClone.activeEffects = [...(defenderClone.activeEffects || []), bonusEffect];
      }
    }
    
    // Effectiveness bonuses (reduced)
    if (damageResult.effectiveness === 'very effective' || damageResult.effectiveness === 'effective') {
      // Effective attacks may cause additional effects
      if (Math.random() < 0.25) { // Reduced from 0.4
        const statusEffect = {
          id: Date.now() + 1,
          name: 'Elemental Weakness',
          icon: '⚡',
          type: 'debuff',
          description: 'Vulnerable to attacks',
          duration: 2, // Reduced from 3
          statModifications: {
            physicalDefense: -1, // Reduced from -2
            magicalDefense: -1   // Reduced from -2
          },
          startTurn: defenderClone.currentTurn || 0
        };
        
        defenderClone.activeEffects = [...(defenderClone.activeEffects || []), statusEffect];
      }
    }
    
    // Update damage result with actual damage
    damageResult.damage = actualDamage;
    damageResult.actualDamage = actualDamage;
  }
  
  // Create detailed battle log entry
  let logMessage = '';
  
  if (damageResult.isDodged) {
    logMessage = `${attackerClone.species_name}'s ${attackType} attack was dodged by ${defenderClone.species_name}!`;
  } else {
    logMessage = `${attackerClone.species_name} used ${attackType} attack on ${defenderClone.species_name}`;
    
    if (damageResult.isCritical) {
      logMessage += ' (Critical Hit!)';
    }
    
    if (comboLevel > 1) {
      logMessage += ` [Combo x${comboLevel}!]`;
    }
    
    if (damageResult.effectiveness !== 'normal') {
      logMessage += ` - ${damageResult.effectiveness}!`;
    }
    
    if (damageResult.damageType && damageResult.damageType !== 'normal') {
      logMessage += ` [${damageResult.damageType}]`;
    }
    
    logMessage += ` dealing ${actualDamage} damage.`;
    
    // Death message
    if (defenderClone.currentHealth <= 0) {
      if (defenderClone.rarity === 'Legendary') {
        logMessage += ` ${defenderClone.species_name} falls in battle!`;
      } else if (defenderClone.rarity === 'Epic') {
        logMessage += ` ${defenderClone.species_name} has been defeated!`;
      } else {
        logMessage += ` ${defenderClone.species_name} was defeated!`;
      }
    } else if (defenderClone.currentHealth < defenderClone.battleStats.maxHealth * 0.2) {
      logMessage += ` ${defenderClone.species_name} is critically wounded!`;
    } else if (defenderClone.currentHealth < defenderClone.battleStats.maxHealth * 0.5) {
      logMessage += ` ${defenderClone.species_name} is wounded!`;
    }
  }
  
  // CRITICAL: Log final health values
  console.log(`processAttack complete: ${defenderClone.species_name} final health = ${defenderClone.currentHealth}`);
  
  // Return the complete attack result with all damage properties
  return {
    updatedAttacker: attackerClone,
    updatedDefender: defenderClone,
    battleLog: logMessage,
    damage: actualDamage,                    // Primary damage property
    finalDamage: actualDamage,                // Alternate damage property
    totalDamage: actualDamage,                // Another alternate
    damageDealt: actualDamage,                // Yet another alternate
    actualDamage: actualDamage,               // And another
    isCritical: damageResult.isCritical || false,
    attackType: attackType,
    isBlocked: damageResult.isDodged || false,
    damageResult: {
      ...damageResult,
      comboMultiplier: comboMultiplier,
      damage: actualDamage
    }
  };
};

// ENHANCED: Apply tool effect with per-turn effects
export const applyTool = (creature, tool, difficulty = 'medium', currentTurn = 0) => {
  // Validate input
  if (!creature || !tool) {
    console.error("Tool application failed - missing creature or tool:", { creature, tool });
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  if (!creature.battleStats) {
    console.error("Tool application failed - creature missing battleStats:", creature);
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  // Make a deep copy of the creature to avoid mutations
  const creatureClone = JSON.parse(JSON.stringify(creature));
  creatureClone.currentTurn = currentTurn; // Track current turn for effects
  
  // Get tool effect with balanced power scaling
  const basePowerMultiplier = calculateEffectPower(tool, creature.stats, difficulty);
  const toolEffect = getToolEffect(tool);
  
  if (!toolEffect) {
    console.error("Tool application failed - invalid tool effect:", { tool, toolEffect });
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  // CRITICAL FIX: Apply the tool effect immediately if it has an applyFunction
  let immediateEffects = {};
  if (toolEffect.applyFunction && typeof toolEffect.applyFunction === 'function') {
    immediateEffects = toolEffect.applyFunction(creatureClone, 1); // Turn 1
    
    // Apply immediate stat changes
    if (immediateEffects.statChanges) {
      Object.entries(immediateEffects.statChanges).forEach(([stat, value]) => {
        const scaledValue = Math.round(value * basePowerMultiplier);
        if (creatureClone.battleStats[stat] !== undefined) {
          creatureClone.battleStats[stat] = Math.max(0, creatureClone.battleStats[stat] + scaledValue);
          console.log(`Tool ${tool.name} applied ${stat} ${scaledValue > 0 ? '+' : ''}${scaledValue}`);
        }
      });
    }
    
    // Apply immediate healing
    if (immediateEffects.healthOverTime && immediateEffects.healthOverTime > 0) {
      const healAmount = Math.round(immediateEffects.healthOverTime * basePowerMultiplier);
      const oldHealth = creatureClone.currentHealth;
      creatureClone.currentHealth = Math.min(
        creatureClone.currentHealth + healAmount,
        creatureClone.battleStats.maxHealth
      );
      console.log(`${tool.name} healed ${creatureClone.species_name} for ${creatureClone.currentHealth - oldHealth} health`);
    }
    
    // Apply energy gain
    if (immediateEffects.energyGain && immediateEffects.energyGain > 0) {
      // This would need to be handled by the calling function
      console.log(`${tool.name} grants ${immediateEffects.energyGain} energy (handle in calling function)`);
    }
  } else {
    // Fallback for tools without applyFunction
    // Scale effects by power multiplier (with caps)
    const scaledToolEffect = {
      ...toolEffect,
      statChanges: toolEffect.statChanges ? 
        Object.entries(toolEffect.statChanges).reduce((acc, [stat, value]) => {
          // Cap stat changes to prevent extreme values
          const cappedValue = Math.min(Math.abs(value), 10) * Math.sign(value);
          acc[stat] = Math.round(cappedValue * Math.min(basePowerMultiplier, 1.5));
          return acc;
        }, {}) : {},
      healthChange: toolEffect.healthChange ? 
        Math.round(Math.min(toolEffect.healthChange * basePowerMultiplier, 50)) : 0, // Cap healing
      healthOverTime: toolEffect.healthOverTime ? 
        Math.round(toolEffect.healthOverTime * basePowerMultiplier) : 0,
      duration: toolEffect.duration || 1,
      applyEachTurn: toolEffect.applyEachTurn || false
    };
    
    // Apply stat changes immediately for visual feedback
    if (scaledToolEffect.statChanges && typeof scaledToolEffect.statChanges === 'object') {
      Object.entries(scaledToolEffect.statChanges).forEach(([stat, value]) => {
        if (creatureClone.battleStats[stat] !== undefined) {
          creatureClone.battleStats[stat] = Math.max(0, creatureClone.battleStats[stat] + value);
        }
      });
    }
    
    // Apply immediate healing (first turn bonus)
    if (scaledToolEffect.healthChange && scaledToolEffect.healthChange > 0) {
      const oldHealth = creatureClone.currentHealth;
      creatureClone.currentHealth = Math.min(
        creatureClone.currentHealth + scaledToolEffect.healthChange,
        creatureClone.battleStats.maxHealth
      );
      
      const actualHealing = creatureClone.currentHealth - oldHealth;
      console.log(`${tool.name} healed ${creatureClone.species_name} for ${actualHealing} health (initial)`);
    }
    
    // Apply first tick of health over time immediately
    if (scaledToolEffect.healthOverTime && scaledToolEffect.healthOverTime !== 0 && scaledToolEffect.duration > 0) {
      const oldHealth = creatureClone.currentHealth;
      creatureClone.currentHealth = Math.min(
        Math.max(0, creatureClone.currentHealth + scaledToolEffect.healthOverTime),
        creatureClone.battleStats.maxHealth
      );
      scaledToolEffect.actualHealthChange = creatureClone.currentHealth - oldHealth;
      console.log(`Applied first tick of health change: ${scaledToolEffect.healthOverTime}`);
    }
  }
  
  // Add active effect with better tracking
  if (toolEffect.duration > 0) {
    const powerLevel = basePowerMultiplier >= 1.3 ? 'strong' :
                     basePowerMultiplier >= 1.1 ? 'normal' : 'weak';
    
    const activeEffect = {
      id: Date.now() + Math.random(),
      name: `${tool.name || "Tool"} Effect`,
      icon: getEffectIcon(tool.tool_effect),
      type: tool.tool_type || "enhancement",
      description: getEffectDescription(tool.tool_effect || "enhancement", powerLevel),
      duration: toolEffect.duration,
      statModifications: immediateEffects.statChanges ? 
        Object.entries(immediateEffects.statChanges).reduce((acc, [stat, value]) => {
          acc[stat] = Math.round(value * basePowerMultiplier);
          return acc;
        }, {}) : (toolEffect.statChanges || {}),
      statChanges: immediateEffects.statChanges || toolEffect.statChanges || {}, // Store for per-turn application
      healthOverTime: immediateEffects.healthOverTime ? 
        Math.round(immediateEffects.healthOverTime * basePowerMultiplier) : 
        (toolEffect.healthOverTime || 0),
      powerLevel: powerLevel,
      startTurn: currentTurn,
      effectType: tool.tool_effect,
      applyEachTurn: toolEffect.applyEachTurn || false,
      applyFunction: toolEffect.applyFunction // Store the apply function
    };
    
    // Add special properties for specific effect types
    if (tool.tool_effect === 'Charge' && toolEffect.chargeEffect) {
      activeEffect.effectType = 'Charge';
      activeEffect.chargeEffect = {
        ...toolEffect.chargeEffect,
        baseValue: Math.round((toolEffect.chargeEffect.baseValue || 5) * basePowerMultiplier),
        perTurnIncrease: Math.round((toolEffect.chargeEffect.perTurnIncrease || 5) * basePowerMultiplier),
        finalBurst: Math.round((toolEffect.chargeEffect.finalBurst || 20) * basePowerMultiplier),
        healingBase: Math.round((toolEffect.chargeEffect.healingBase || 3) * basePowerMultiplier),
        healingIncrease: Math.round((toolEffect.chargeEffect.healingIncrease || 3) * basePowerMultiplier),
        targetStats: toolEffect.chargeEffect.targetStats || ["physicalDefense"]
      };
    }
    
    if (tool.tool_effect === 'Echo' && toolEffect.echoEffect) {
      activeEffect.effectType = 'Echo';
      activeEffect.echoEffect = {
        ...toolEffect.echoEffect,
        decayRate: toolEffect.echoEffect.decayRate || 0.7,
        healingBase: Math.round((toolEffect.echoEffect.healingBase || 5) * basePowerMultiplier),
        healingDecay: toolEffect.echoEffect.healingDecay || 0.7
      };
      
      // For echo effects with stat changes, calculate base values
      if (immediateEffects.statChanges || toolEffect.statChanges) {
        activeEffect.echoEffect.statBase = {};
        const statChanges = immediateEffects.statChanges || toolEffect.statChanges;
        Object.entries(statChanges).forEach(([stat, value]) => {
          activeEffect.echoEffect.statBase[stat] = Math.round(value * basePowerMultiplier);
        });
      }
    }
    
    creatureClone.activeEffects = [
      ...(creatureClone.activeEffects || []),
      activeEffect
    ];
  }
  
  // Recalculate derived stats after tool application
  creatureClone.battleStats = recalculateDerivedStats(creatureClone);
  
  return {
    updatedCreature: creatureClone,
    toolEffect: toolEffect
  };
};

// NEW UNIFIED applySpell function using applyFunction pattern
export const applySpell = (caster, target, spell, difficulty = 'medium', currentTurn = 0) => {
  console.log(`\n=== APPLYING SPELL: ${spell.name} ===`);
  
  if (!caster || !target || !spell) {
    console.error("Spell application failed - missing parameters");
    return null;
  }
  
  // Deep clone
  const targetClone = JSON.parse(JSON.stringify(target));
  const casterClone = JSON.parse(JSON.stringify(caster));
  targetClone.currentTurn = currentTurn;
  casterClone.currentTurn = currentTurn;
  
  // Get spell effect using the new unified system
  const spellEffect = getSpellEffect(spell, caster.stats?.magic || 5);
  
  if (!spellEffect || !spellEffect.applyFunction) {
    console.error("Invalid spell effect");
    return null;
  }
  
  // Apply first turn effect
  const firstTurnEffect = spellEffect.applyFunction(casterClone, targetClone, 1);
  
  // Track total damage/healing for result
  let totalDamageDealt = 0;
  let totalHealingDone = 0;
  
  // Apply damage (respecting armor piercing)
  if (firstTurnEffect.damage && firstTurnEffect.damage > 0) {
    let finalDamage = firstTurnEffect.damage;
    
    // Apply resistance unless armor piercing
    if (!firstTurnEffect.armorPiercing) {
      const magicResistance = Math.min(targetClone.battleStats.magicalDefense / 200, 0.5);
      finalDamage = Math.round(finalDamage * (1 - magicResistance));
    }
    
    const healthBefore = targetClone.currentHealth;
    targetClone.currentHealth = Math.max(0, targetClone.currentHealth - finalDamage);
    totalDamageDealt = healthBefore - targetClone.currentHealth;
  }
  
  // Apply healing to target
  if (firstTurnEffect.healthOverTime && firstTurnEffect.healthOverTime > 0) {
    const healthBefore = targetClone.currentHealth;
    targetClone.currentHealth = Math.min(
      targetClone.currentHealth + firstTurnEffect.healthOverTime,
      targetClone.battleStats.maxHealth
    );
    totalHealingDone = targetClone.currentHealth - healthBefore;
  }
  
  // Apply self-healing (for drain spells)
  if (firstTurnEffect.selfHeal && firstTurnEffect.selfHeal > 0) {
    const healthBefore = casterClone.currentHealth;
    casterClone.currentHealth = Math.min(
      casterClone.currentHealth + firstTurnEffect.selfHeal,
      casterClone.battleStats.maxHealth
    );
  }
  
  // Apply stat changes to target
  if (firstTurnEffect.statChanges) {
    Object.entries(firstTurnEffect.statChanges).forEach(([stat, value]) => {
      if (targetClone.battleStats[stat] !== undefined) {
        targetClone.battleStats[stat] = Math.max(0, targetClone.battleStats[stat] + value);
      }
    });
  }
  
  // Apply stat changes to caster (for drain spells)
  if (firstTurnEffect.selfStatChanges) {
    Object.entries(firstTurnEffect.selfStatChanges).forEach(([stat, value]) => {
      if (casterClone.battleStats[stat] !== undefined) {
        casterClone.battleStats[stat] = Math.max(0, casterClone.battleStats[stat] + value);
      }
    });
  }
  
  // Create active effects for multi-turn spells
  if (spellEffect.duration > 1) {
    // Effect on target
    const targetEffect = {
      id: Date.now() + Math.random(),
      name: `${spell.name} Effect`,
      icon: getEffectIcon(spell.spell_effect),
      type: 'spell',
      description: firstTurnEffect.logMessage,
      duration: spellEffect.duration - 1, // -1 because turn 1 already applied
      applyFunction: spellEffect.applyFunction,
      applyEachTurn: true,
      startTurn: currentTurn,
      casterId: caster.id,
      targetId: target.id,
      // Preserve special properties
      damageReduction: firstTurnEffect.damageReduction,
      echoEffect: spellEffect.echoEffect,
      chargeEffect: spellEffect.chargeEffect,
      crossCreature: spellEffect.crossCreature
    };
    
    targetClone.activeEffects = [...(targetClone.activeEffects || []), targetEffect];
    
    // For cross-creature spells (like Scrypto Surge), add effect to caster too
    if (spellEffect.crossCreature) {
      const casterEffect = {
        ...targetEffect,
        id: Date.now() + Math.random() + 1,
        name: `${spell.name} (Self)`,
        isCasterEffect: true
      };
      
      casterClone.activeEffects = [...(casterClone.activeEffects || []), casterEffect];
    }
  }
  
  // Recalculate stats
  targetClone.battleStats = recalculateDerivedStats(targetClone);
  casterClone.battleStats = recalculateDerivedStats(casterClone);
  
  return {
    updatedCaster: casterClone,
    updatedTarget: targetClone,
    spellEffect: {
      damage: totalDamageDealt,
      healing: totalHealingDone,
      actualDamage: totalDamageDealt,
      actualHealing: totalHealingDone,
      wasCritical: firstTurnEffect.isCritical || false,
      duration: spellEffect.duration,
      applyStun: firstTurnEffect.applyStun || false,
      areaEffect: firstTurnEffect.areaEffect || false,
      charging: firstTurnEffect.charging || false
    }
  };
};

// FIXED: Put creature in defensive stance that lasts through opponent's turn
export const defendCreature = (creature, difficulty = 'medium') => {
  if (!creature || !creature.battleStats) {
    console.error("Cannot defend with invalid creature");
    return creature;
  }
  
  console.log(`${creature.species_name} is defending!`);
  
  // Create a deep clone
  const creatureClone = JSON.parse(JSON.stringify(creature));
  
  // Mark as defending
  creatureClone.isDefending = true;
  
  // Calculate defense boost based on creature's defense stats
  const basePhysicalDefense = creatureClone.battleStats.physicalDefense || 50;
  const baseMagicalDefense = creatureClone.battleStats.magicalDefense || 50;
  
  // Defense provides 50% damage reduction through temporary stat boost
  const physicalDefenseBoost = Math.round(basePhysicalDefense * 0.5);
  const magicalDefenseBoost = Math.round(baseMagicalDefense * 0.5);
  
  // Rarity bonus for defense
  const rarityBonus = getRarityMultiplier(creatureClone.rarity) - 1; // 0% for common, 10% for legendary
  
  // Apply defense effects that last only for the enemy's turn
  if (!creatureClone.activeEffects) {
    creatureClone.activeEffects = [];
  }
  
  // FIXED: Add defense effect that PERSISTS through the opponent's turn
  // It should NOT be processed/reduced until the end of the opponent's turn
  creatureClone.activeEffects = [
    ...creatureClone.activeEffects,
    {
      id: `defense-${Date.now()}`,
      type: 'defense',
      name: 'Defensive Stance',
      icon: '🛡️',
      duration: 2, // FIXED: Set to 2 turns so it survives through processing
      effectType: 'Shield',
      statModifications: {
        physicalDefense: physicalDefenseBoost + Math.round(physicalDefenseBoost * rarityBonus),
        magicalDefense: magicalDefenseBoost + Math.round(magicalDefenseBoost * rarityBonus)
      },
      damageReduction: difficulty === 'hard' || difficulty === 'expert' ? 0.4 : 0.2,
      startTurn: creatureClone.currentTurn || 0,
      persistThroughTurn: true, // Mark as persisting
      isDefenseEffect: true // Special flag for defense effects
    }
  ];
  
  console.log(`Defense applied to ${creature.species_name}:`, {
    physicalBoost: physicalDefenseBoost + rarityBonus,
    magicalBoost: magicalDefenseBoost + rarityBonus,
    activeEffects: creatureClone.activeEffects.length
  });
  
  return creatureClone;
};

// Unified helper function to get appropriate icon for effects
const getEffectIcon = (effectType) => {
  const icons = {
    'Surge': '⚡',
    'surge': '⚡',
    'Shield': '🛡️',
    'shield': '🛡️',
    'Echo': '🔊',
    'echo': '🔊',
    'Drain': '🩸',
    'drain': '🩸',
    'Charge': '🔋',
    'charge': '🔋'
  };
  return icons[effectType] || '✨';
};

// ENHANCED: Process energy momentum and return bonus regen
export const processEnergyMomentum = (momentum) => {
  // Energy momentum provides bonus regen based on total momentum
  const bonusRegen = Math.floor(momentum / 10); // 1 bonus regen per 10 momentum
  
  return {
    currentMomentum: momentum,
    bonusRegen: bonusRegen,
    nextThreshold: 10 - (momentum % 10), // Energy needed for next bonus
    totalBonusEarned: bonusRegen
  };
};

// ENHANCED: Apply field synergies and return modified creatures
export const applyFieldSynergies = (creatures) => {
  if (!creatures || creatures.length === 0) return creatures;
  
  // Check for active synergies
  const synergies = checkFieldSynergies(creatures);
  
  if (synergies.length === 0) return creatures;
  
  console.log(`Applying ${synergies.length} synergies to field:`, synergies);
  
  // Apply synergy modifiers to all creatures
  return applySynergyModifiers(creatures, synergies);
};

// FIXED: Create visual effect data for synergies with default colors
export const createSynergyEffectData = (synergies) => {
  // Define default colors for synergy types
  const defaultColors = {
    'species': '#4CAF50',
    'legendary_presence': '#FFD700',
    'stat_synergy': '#2196F3',
    'form_protection': '#9C27B0',
    'balanced_team': '#00BCD4',
    'full_field': '#FF5722'
  };
  
  return synergies.map(synergy => {
    let data = {};
    
    if (synergy.type === 'species') {
      data = {
        type: 'species-synergy',
        species: synergy.species,
        count: synergy.count,
        bonus: synergy.bonus,
        message: `${synergy.species} Synergy x${synergy.count}! (+${Math.round(synergy.bonus * 100)}% stats)`,
        color: synergy.color || defaultColors['species'] || '#4CAF50'
      };
    } else if (synergy.type === 'stats' || synergy.type === 'stat_synergy') {
      data = {
        type: 'stat-synergy',
        stats: synergy.stats || [],
        bonus: synergy.bonus,
        message: synergy.name || `Stat Synergy! (+${Math.round(synergy.bonus * 100)}% stats)`,
        color: synergy.color || defaultColors['stat_synergy'] || '#2196F3'
      };
    } else if (synergy.type === 'legendary_presence') {
      data = {
        type: 'legendary-presence',
        bonus: synergy.bonus,
        message: synergy.name || `Legendary Presence! (+${Math.round(synergy.bonus * 100)}% stats)`,
        color: synergy.color || defaultColors['legendary_presence'] || '#FFD700'
      };
    } else if (synergy.type === 'form_protection') {
      data = {
        type: 'form-protection',
        bonus: synergy.bonus,
        message: synergy.name || `Guardian Presence! (+${Math.round(synergy.bonus * 100)}% defense)`,
        color: synergy.color || defaultColors['form_protection'] || '#9C27B0'
      };
    } else if (synergy.type === 'balanced_team') {
      data = {
        type: 'balanced-team',
        bonus: synergy.bonus,
        message: synergy.name || `Balanced Formation! (+${Math.round(synergy.bonus * 100)}% all stats)`,
        color: synergy.color || defaultColors['balanced_team'] || '#00BCD4'
      };
    } else if (synergy.type === 'full_field') {
      data = {
        type: 'full-field',
        bonus: synergy.bonus,
        message: synergy.name || `Full Force! (+${Math.round(synergy.bonus * 100)}% all stats)`,
        color: synergy.color || defaultColors['full_field'] || '#FF5722'
      };
    } else {
      // Default case for unknown synergy types
      data = {
        type: synergy.type || 'unknown',
        bonus: synergy.bonus || 0,
        message: synergy.name || `${synergy.type} Synergy!`,
        color: synergy.color || '#2196F3'
      };
    }
    
    return data;
  });
};

// NEW: Calculate and display energy efficiency for actions
export const calculateEnergyEfficiency = (action, creature, energyCost) => {
  if (!action || !creature || !energyCost) return 0;
  
  let potentialValue = 0;
  
  switch (action) {
    case 'attack':
      const attackPower = Math.max(
        creature.battleStats?.physicalAttack || 0,
        creature.battleStats?.magicalAttack || 0
      );
      potentialValue = attackPower;
      break;
      
    case 'defend':
      const defensePower = Math.max(
        creature.battleStats?.physicalDefense || 0,
        creature.battleStats?.magicalDefense || 0
      );
      potentialValue = defensePower * 2; // Defense is valuable
      break;
      
    case 'deploy':
      potentialValue = calculateCreaturePower(creature) / 10;
      break;
      
    default:
      potentialValue = 10;
  }
  
  // Return efficiency ratio (higher is better) - ROUND to 1 decimal
  return energyCost > 0 ? Math.round((potentialValue / energyCost) * 10) / 10 : 0;
};

// NEW: Process charge effect progression
export const updateChargeEffects = (creature, currentTurn) => {
  if (!creature.activeEffects) return creature;
  
  const updatedCreature = { ...creature };
  
  updatedCreature.activeEffects = creature.activeEffects.map(effect => {
    if (effect.effectType === 'Charge' && effect.chargeEffect) {
      const turnsActive = currentTurn - (effect.startTurn || 0);
      const maxTurns = effect.chargeEffect.maxTurns || 3;
      const chargeProgress = Math.min(turnsActive / maxTurns, 1.0) * 100;
      
      return {
        ...effect,
        chargeProgress: chargeProgress,
        turnsRemaining: Math.max(0, maxTurns - turnsActive),
        isReady: chargeProgress >= 100
      };
    }
    return effect;
  });
  
  return updatedCreature;
};

// Export the missing function for creature power calculation
export const calculateCreaturePower = (creature) => {
  if (!creature || !creature.battleStats) return 0;
  
  const stats = creature.battleStats;
  const attackPower = Math.max(stats.physicalAttack || 0, stats.magicalAttack || 0);
  const defensePower = Math.max(stats.physicalDefense || 0, stats.magicalDefense || 0);
  const utilityPower = (stats.initiative || 0) + (stats.criticalChance || 0) + (stats.dodgeChance || 0);
  
  const formLevel = parseInt(creature.form) || 0;
  
  return Math.round(
    (attackPower * 2) + 
    defensePower + 
    (stats.maxHealth || 0) * 0.1 + 
    utilityPower * 0.5 +
    formLevel * 5 +
    getRarityValue(creature.rarity) * 10
  );
};

// Helper function for rarity values
const getRarityValue = (rarity) => {
  switch (rarity) {
    case 'Legendary': return 4;
    case 'Epic': return 3;
    case 'Rare': return 2;
    default: return 1;
  }
};

// NEW: Get effect events for animation (healing/damage from ongoing effects)
export const getEffectEvents = (creatures) => {
  if (!creatures || !creatures._effectEvents) return [];
  return creatures._effectEvents;
};

// Export helper functions for use in other components
export { checkFieldSynergies, recalculateDerivedStats };

/* 
UNIFIED EFFECTS SYSTEM:

ALL effects (tools and spells) now use the same applyFunction pattern:
- First turn applies immediate effects
- Subsequent turns apply per-turn effects
- Cross-creature effects (drains) are handled properly
- All effects can have healing, damage, stat changes, etc.

The system is simpler and more consistent, with no special cases for spells vs tools.
*/
