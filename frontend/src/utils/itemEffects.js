// src/utils/itemEffects.js - COMPLETE PRODUCTION-READY VERSION WITH UNIFIED SPELL SYSTEM

// ============================================
// TOOL DEFINITIONS - 5 Specific Tool NFTs
// ============================================

const TOOL_DEFINITIONS = {
  // 1. Babylon Keystone - Energy/Echo: Energy efficiency that echoes
  'Babylon Keystone': {
    id: 'babylon_keystone',
    type: 'tool',
    element: 'energy',
    effect: 'echo',
    duration: 4,
    imageUrl: 'https://cvxlab.net/assets/tools/babylon_keystone.png',
    applyEffect: (creature, turn) => {
      // Echo effect: starts strong, decays each turn
      const echoMultiplier = Math.pow(0.7, turn - 1); // 100%, 70%, 49%, 34%
      
      return {
        statChanges: {
          energyCost: Math.round(-1 * echoMultiplier) || -1 // Reduce energy costs (min -1)
        },
        energyGain: Math.max(1, Math.round(2 * echoMultiplier)), // Gain energy per turn (min 1)
        healthOverTime: Math.max(1, Math.round(2 * echoMultiplier)), // Heal HP per turn (min 1)
        damage: 0,
        logMessage: turn === 1 ? `${creature.species_name} activates Babylon Keystone for echoing energy efficiency!` : null
      };
    },
    echoEffect: {
      decayRate: 0.7,
      healingBase: 2,
      healingDecay: 0.7,
      statBase: {
        energyCost: -1
      }
    }
  },

  // 2. Hyperscale Capacitor - Strength/Surge: Fast strength boost
  'Hyperscale Capacitor': {
    id: 'hyperscale_capacitor',
    type: 'tool',
    element: 'strength',
    effect: 'surge',
    duration: 2, // Surge is fast but short
    imageUrl: 'https://cvxlab.net/assets/tools/hyperscale_capacitor.png',
    applyEffect: (creature, turn) => {
      // Surge: High power, short duration
      return {
        statChanges: {
          physicalAttack: 15,
          physicalDefense: 8
        },
        healthOverTime: 5,
        damage: 0,
        logMessage: turn === 1 ? `${creature.species_name} surges with power from Hyperscale Capacitor!` : null
      };
    }
  },

  // 3. Ledger Lens - Magic/Shield: Magical defense shield
  'Ledger Lens': {
    id: 'ledger_lens',
    type: 'tool',
    element: 'magic',
    effect: 'shield',
    duration: 4,
    imageUrl: 'https://cvxlab.net/assets/tools/ledger_lens.png',
    applyEffect: (creature, turn) => {
      // Shield: Strong defense and healing
      // Apply max health bonus only on first turn to avoid stacking
      const maxHealthBonus = turn === 1 ? 20 : 0;
      
      return {
        statChanges: {
          physicalDefense: 12,
          magicalDefense: 12,
          maxHealth: maxHealthBonus
        },
        healthOverTime: 8,
        damage: 0,
        barrier: turn === 1 ? 20 : 0, // Initial barrier on first turn only
        logMessage: turn === 1 ? `${creature.species_name} is protected by the Ledger Lens shield!` : null
      };
    }
  },

  // 4. Olympia Emblem - Stamina/Charge: Builds power over time
  'Olympia Emblem': {
    id: 'olympia_emblem',
    type: 'tool',
    element: 'stamina',
    effect: 'charge',
    duration: 4,
    imageUrl: 'https://cvxlab.net/assets/tools/olympia_emblem.png',
    applyEffect: (creature, turn) => {
      // Charge: Gets stronger each turn
      const chargeLevel = turn; // 1, 2, 3, 4
      const defenseBonus = chargeLevel * 5; // 5, 10, 15, 20
      const healing = 10 + (chargeLevel * 3); // 13, 16, 19, 22
      const finalBurst = turn === 4 ? 25 : 0; // Big burst on final turn
      
      return {
        statChanges: {
          physicalDefense: defenseBonus,
          magicalDefense: Math.round(defenseBonus * 0.5)
        },
        healthOverTime: healing + finalBurst,
        damage: 0,
        logMessage: turn === 1 ? `${creature.species_name} begins charging the Olympia Emblem!` : 
                   turn === 4 ? `Olympia Emblem releases its full power!` : null
      };
    },
    chargeEffect: {
      baseValue: 5,
      perTurnIncrease: 5,
      finalBurst: 25,
      healingBase: 13,
      healingIncrease: 3,
      targetStats: ["physicalDefense", "magicalDefense"],
      maxTurns: 4
    }
  },

  // 5. Validator Core - Speed/Drain: Trade defense for offense
  'Validator Core': {
    id: 'validator_core',
    type: 'tool',
    element: 'speed',
    effect: 'drain',
    duration: 4,
    imageUrl: 'https://cvxlab.net/assets/tools/validator_core.png',
    applyEffect: (creature, turn) => {
      // Drain: Sacrifice defense for offense
      return {
        statChanges: {
          physicalAttack: 10,
          magicalAttack: 10,
          physicalDefense: -3,
          magicalDefense: -3
        },
        healthOverTime: 7,
        damage: 0,
        logMessage: turn === 1 ? `${creature.species_name} activates Validator Core, draining defense for power!` : null
      };
    }
  }
};

// ============================================
// SPELL DEFINITIONS - 5 Specific Spell NFTs
// ============================================

const SPELL_DEFINITIONS = {
  // Babylon Burst - Instant massive damage with crit and armor piercing
  'Babylon Burst': {
    id: 'babylon_burst',
    type: 'spell',
    element: 'energy',
    effect: 'surge',
    energyCost: 4,
    duration: 1,
    imageUrl: 'https://cvxlab.net/assets/spells/babylon_burst.png',
    applyFunction: (caster, target, turn) => {
      if (turn > 1) return { damage: 0 };
      
      const magicPower = 1 + ((caster.battleStats?.magic || 5) * 0.15);
      const baseDamage = 30;
      const damage = Math.round(baseDamage * magicPower);
      
      // Preserve critical hit functionality
      const isCritical = Math.random() < 0.20;
      const finalDamage = Math.round(isCritical ? damage * 1.5 : damage);
      
      return {
        damage: finalDamage,
        isCritical: isCritical,
        armorPiercing: true, // Preserve armor piercing
        statChanges: {},
        healthOverTime: 0,
        logMessage: `${caster.species_name} unleashes Babylon Burst for ${finalDamage} damage${isCritical ? ' (CRITICAL!)' : ''}!`
      };
    }
  },

  // Scrypto Surge - Drain spell (damage + self heal + stat changes)
  'Scrypto Surge': {
    id: 'scrypto_surge',
    type: 'spell',
    element: 'strength',
    effect: 'drain',
    energyCost: 4,
    duration: 3,
    imageUrl: 'https://cvxlab.net/assets/spells/scrypto_surge.png',
    applyFunction: (caster, target, turn) => {
      const magicPower = 1 + ((caster.battleStats?.magic || 5) * 0.15);
      const baseDamage = 12;
      const damage = Math.round(baseDamage * magicPower);
      const healing = Math.round(10 * magicPower);
      
      // Stat changes only on first turn (preserve original behavior)
      const targetStatChanges = turn === 1 ? {
        physicalAttack: -4,
        magicalAttack: -4
      } : {};
      
      const casterStatChanges = turn === 1 ? {
        physicalAttack: 3,
        magicalAttack: 3
      } : {};
      
      return {
        damage: damage,
        selfHeal: healing,
        statChanges: targetStatChanges,
        selfStatChanges: casterStatChanges,
        healthOverTime: 0,
        logMessage: turn === 1 ? 
          `Scrypto Surge drains ${damage} HP and heals ${caster.species_name} for ${healing} HP!` :
          `Scrypto Surge continues to drain ${damage} HP and heal ${healing} HP!`
      };
    },
    // Mark as cross-creature effect
    crossCreature: true
  },

  // Cerberus Chain - Instant heal + buffs + regen
  'Cerberus Chain': {
    id: 'cerberus_chain',
    type: 'spell',
    element: 'stamina',
    effect: 'shield',
    energyCost: 4,
    duration: 3,
    imageUrl: 'https://cvxlab.net/assets/spells/cerberus_chain.png',
    applyFunction: (caster, target, turn) => {
      const magicPower = 1 + ((caster.battleStats?.magic || 5) * 0.15);
      
      if (turn === 1) {
        // First turn: Big instant heal (58 base at magic 19) + buffs
        const instantHeal = Math.round(15 * magicPower);
        
        return {
          damage: 0,
          healthOverTime: instantHeal, // This will apply immediately
          statChanges: {
            physicalDefense: 8,
            magicalDefense: 8,
            maxHealth: 15
          },
          damageReduction: 0.15, // Preserve damage reduction
          logMessage: `Cerberus Chain heals ${instantHeal} HP and grants powerful defenses!`
        };
      } else {
        // Subsequent turns: Just regen (5 * magic power)
        const regenHeal = Math.round(5 * magicPower);
        
        return {
          damage: 0,
          healthOverTime: regenHeal,
          statChanges: {}, // Stats already applied
          logMessage: `Cerberus Chain regenerates ${regenHeal} HP`
        };
      }
    }
  },

  // Engine Overclock - Echo effect with decay
  'Engine Overclock': {
    id: 'engine_overclock',
    type: 'spell',
    element: 'speed',
    effect: 'echo',
    energyCost: 4,
    duration: 4,
    imageUrl: 'https://cvxlab.net/assets/spells/engine_overclock.png',
    applyFunction: (caster, target, turn) => {
      // Echo decay: 100%, 70%, 49%, 34%
      const echoMultiplier = Math.pow(0.7, turn - 1);
      const magicPower = 1 + ((caster.battleStats?.magic || 5) * 0.15);
      
      // Base values that decay
      const baseHealing = 3;
      const healing = Math.max(1, Math.round(baseHealing * echoMultiplier * magicPower));
      
      return {
        damage: 0,
        healthOverTime: healing, // Healing that echoes and decays
        statChanges: {
          initiative: Math.round(10 * echoMultiplier),
          dodgeChance: Math.round(3 * echoMultiplier),
          criticalChance: Math.round(3 * echoMultiplier)
        },
        echoPercent: Math.round(echoMultiplier * 100), // For UI display
        logMessage: turn === 1 ? 
          `Engine Overclock boosts ${target.species_name}'s speed and heals ${healing} HP!` : 
          `Engine Overclock echoes (${Math.round(echoMultiplier * 100)}% power) - healing ${healing} HP`
      };
    },
    echoEffect: true // Mark as echo for special handling
  },

  // Shardstorm - Charge spell with stun
  'Shardstorm': {
    id: 'shardstorm',
    type: 'spell',
    element: 'magic',
    effect: 'charge',
    energyCost: 4,
    duration: 2,
    imageUrl: 'https://cvxlab.net/assets/spells/shardstorm.png',
    applyFunction: (caster, target, turn) => {
      if (turn === 1) {
        // Charge turn - no damage
        return {
          damage: 0,
          statChanges: {},
          healthOverTime: 0,
          charging: true,
          logMessage: `${caster.species_name} begins charging Shardstorm...`
        };
      } else {
        // Damage turn
        const magicPower = 1 + ((caster.battleStats?.magic || 5) * 0.15);
        const damage = Math.round(35 * magicPower);
        const isStunned = Math.random() < 0.20;
        
        return {
          damage: damage,
          areaEffect: true, // Preserve area effect
          applyStun: isStunned,
          statChanges: {},
          healthOverTime: 0,
          logMessage: `Shardstorm erupts for ${damage} area damage${isStunned ? ' and STUNS the target!' : ''}!`
        };
      }
    },
    chargeEffect: true // Mark as charge spell
  }
};

// ============================================
// MAIN EXPORT FUNCTIONS (Keep same interface)
// ============================================

// Get tool effect - NOW SPECIFIC TO EACH TOOL
export const getToolEffect = (tool) => {
  if (!tool) {
    console.error("Invalid tool data: null or undefined");
    return {
      statChanges: { physicalDefense: 2 },
      duration: 1
    };
  }
  
  // Support both old format (with tool_type/tool_effect) and new format (with name)
  let toolName = tool.name;
  
  // Fallback: Try to map old format to new tool names
  if (!toolName && tool.tool_type && tool.tool_effect) {
    const mapping = {
      'energy-echo': 'Babylon Keystone',
      'strength-surge': 'Hyperscale Capacitor',
      'magic-shield': 'Ledger Lens',
      'stamina-charge': 'Olympia Emblem',
      'speed-drain': 'Validator Core'
    };
    const key = `${tool.tool_type}-${tool.tool_effect}`.toLowerCase();
    toolName = mapping[key];
  }
  
  const definition = TOOL_DEFINITIONS[toolName];
  if (!definition) {
    console.warn(`Unknown tool: ${toolName}, using generic effect`);
    // Fallback to generic if needed
    return {
      statChanges: { physicalDefense: 5 },
      healthOverTime: 3,
      duration: 3,
      applyEachTurn: true
    };
  }
  
  // Return the tool definition for use in battle
  return {
    name: toolName,
    duration: definition.duration,
    applyFunction: definition.applyEffect,
    element: definition.element,
    effect: definition.effect,
    applyEachTurn: true,
    // For tools with echo/charge effects, include special properties
    echoEffect: definition.effect === 'echo' ? {
      decayRate: 0.7,
      healingBase: 5,
      healingDecay: 0.7
    } : undefined,
    chargeEffect: definition.effect === 'charge' ? {
      baseValue: 5,
      perTurnIncrease: 5,
      finalBurst: 20,
      healingBase: 10,
      healingIncrease: 3,
      targetStats: ["physicalDefense", "magicalDefense"]
    } : undefined
  };
};

// UPDATE getSpellEffect to return EXACTLY the same structure as tools
export const getSpellEffect = (spell, casterMagic = 5) => {
  if (!spell) {
    console.error("Invalid spell data: null or undefined");
    return null;
  }
  
  let spellName = spell.name;
  
  // Fallback mapping for legacy data
  if (!spellName && spell.spell_type && spell.spell_effect) {
    const mapping = {
      'energy-surge': 'Babylon Burst',
      'stamina-shield': 'Cerberus Chain',
      'speed-echo': 'Engine Overclock',
      'strength-drain': 'Scrypto Surge',
      'magic-charge': 'Shardstorm'
    };
    const key = `${spell.spell_type}-${spell.spell_effect}`.toLowerCase();
    spellName = mapping[key];
  }
  
  const definition = SPELL_DEFINITIONS[spellName];
  if (!definition) {
    console.warn(`Unknown spell: ${spellName}`);
    return null;
  }
  
  // Return UNIFIED structure (same as tools!)
  return {
    name: spellName,
    duration: definition.duration,
    applyFunction: definition.applyFunction,
    applyEachTurn: true,
    element: definition.element,
    effect: definition.effect,
    energyCost: definition.energyCost,
    // Special flags
    crossCreature: definition.crossCreature || false,
    echoEffect: definition.echoEffect || false,
    chargeEffect: definition.chargeEffect || false,
    // For backwards compatibility
    effectType: definition.effect,
    spellName: spellName
  };
};

// ============================================
// HELPER FUNCTIONS (Maintain backwards compatibility)
// ============================================

// Calculate effect power (keeping for compatibility)
export const calculateEffectPower = (item, casterStats, difficulty = 'medium') => {
  let powerMultiplier = 1.0;
  
  // Difficulty scaling
  switch (difficulty) {
    case 'easy': powerMultiplier *= 0.9; break;
    case 'medium': powerMultiplier *= 1.0; break;
    case 'hard': powerMultiplier *= 1.1; break;
    case 'expert': powerMultiplier *= 1.2; break;
  }
  
  // Caster stats scaling (for spells)
  if (casterStats && item.name) {
    const definition = SPELL_DEFINITIONS[item.name] || TOOL_DEFINITIONS[item.name];
    if (definition && definition.element) {
      const relevantStat = casterStats[definition.element] || 5;
      powerMultiplier *= (1 + (relevantStat - 5) * 0.05);
    }
  }
  
  return powerMultiplier;
};

// Get effect description
export const getEffectDescription = (item, effectPower = 1.0) => {
  const definition = TOOL_DEFINITIONS[item.name] || SPELL_DEFINITIONS[item.name];
  
  if (!definition) {
    return 'Unknown effect';
  }
  
  const powerLevel = effectPower >= 1.3 ? 'powerful' :
                    effectPower >= 1.1 ? 'effective' :
                    effectPower >= 1.0 ? 'standard' : 'weak';
  
  const effectDescriptions = {
    'surge': `Unleashes a ${powerLevel} burst of ${definition.element} energy`,
    'shield': `Creates a ${powerLevel} protective barrier`,
    'echo': `Applies ${powerLevel} effects that echo with decreasing power`,
    'drain': `Drains vitality to fuel ${powerLevel} abilities`,
    'charge': `Charges up for a ${powerLevel} effect`
  };
  
  return effectDescriptions[definition.effect] || 'Mysterious effect';
};

// Calculate combo effect multiplier
export const calculateComboEffect = (comboLevel) => {
  // Combo multipliers: 1x, 1.2x, 1.5x, 2x, 2.5x...
  if (comboLevel <= 0) return 1;
  if (comboLevel === 1) return 1.2;
  if (comboLevel === 2) return 1.5;
  return Math.min(1.5 + (comboLevel - 2) * 0.5, 5); // Cap at 5x
};

// Get visual effect data (animations, particles, etc.)
export const getVisualEffectData = (effectName) => {
  const visualEffects = {
    'surge': {
      color: '#FFD700',
      animation: 'pulse-burst',
      particles: 'sparks',
      duration: 800,
      intensity: 'high'
    },
    'shield': {
      color: '#4169E1',
      animation: 'shield-bubble',
      particles: 'hexagons',
      duration: 1000,
      intensity: 'medium'
    },
    'echo': {
      color: '#9370DB',
      animation: 'ripple-fade',
      particles: 'waves',
      duration: 1500,
      intensity: 'fading'
    },
    'drain': {
      color: '#F44336',
      animation: 'drain-spiral',
      particles: 'smoke',
      duration: 1200,
      intensity: 'high'
    },
    'charge': {
      color: '#FF9800',
      animation: 'charge-buildup',
      particles: 'energy',
      duration: 2000,
      intensity: 'building'
    }
  };
  
  return visualEffects[effectName?.toLowerCase()] || {
    color: '#FFFFFF',
    animation: 'fade',
    particles: 'none',
    duration: 500,
    intensity: 'low'
  };
};

// Helper for spell icons
const getSpellIcon = (effect) => {
  const icons = {
    'surge': '💥',
    'shield': '✨',
    'echo': '🌊',
    'drain': '🌙',
    'charge': '☄️'
  };
  return icons[effect] || '✨';
};

// Calculate item efficiency (for AI)
export const calculateItemEfficiency = (item, target, gameState) => {
  let efficiency = 20; // Base score for all items
  
  const definition = TOOL_DEFINITIONS[item.name] || SPELL_DEFINITIONS[item.name];
  if (!definition) {
    // Fallback for unknown items
    console.warn(`Unknown item in efficiency calculation: ${item.name}`);
    return efficiency;
  }
  
  // Context-based efficiency using definition.effect
  switch (definition.effect) {
    case 'shield':
      // Shield is more efficient on low-health targets
      const healthPercent = target.currentHealth / (target.battleStats?.maxHealth || 50);
      efficiency += (1 - healthPercent) * 50;
      break;
      
    case 'surge':
      // Surge is more efficient when about to attack
      if (gameState.plannedActions?.includes('attack')) {
        efficiency += 30;
      }
      break;
      
    case 'drain':
      // Drain is efficient when both dealing and taking damage
      if (target.currentHealth < target.battleStats?.maxHealth * 0.7) {
        efficiency += 25;
      }
      break;
      
    case 'echo':
      // Echo is efficient for long-term value
      efficiency += 20;
      break;
      
    case 'charge':
      // Charge is efficient when you have time to build up
      if (gameState.turn < 5) {
        efficiency += 35;
      }
      break;
  }
  
  // Cost efficiency (tools are free, spells cost energy)
  if (definition.energyCost) {
    efficiency -= (definition.energyCost * 2);
  }
  
  return efficiency;
};

// Get recommended item usage (for AI)
export const getRecommendedItemUsage = (availableItems, creature, target, gameState) => {
  if (!availableItems || availableItems.length === 0) return null;
  
  let bestItem = null;
  let bestScore = 0;
  
  availableItems.forEach(item => {
    const score = calculateItemEfficiency(item, target || creature, gameState);
    
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  });
  
  return {
    item: bestItem,
    score: bestScore,
    recommendation: bestScore > 50 ? 'highly recommended' : 
                    bestScore > 30 ? 'recommended' : 
                    'situational'
  };
};

// Backwards compatibility: Also export getVisualEffectInfo with the old name
export const getVisualEffectInfo = getVisualEffectData;

// ============================================
// DEFAULT EXPORT (Maintain backwards compatibility)
// ============================================
export default {
  getToolEffect,
  getSpellEffect,
  calculateEffectPower,
  getEffectDescription,
  calculateComboEffect,
  getVisualEffectData,
  calculateItemEfficiency,
  getRecommendedItemUsage,
  // Additional exports that might be used
  getVisualEffectInfo
};
