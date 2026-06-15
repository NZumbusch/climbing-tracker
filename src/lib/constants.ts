import type { ExerciseTypeDef, PhaseType, Workout } from './types';

/**
 * Standard colors for training categories used in charts and indicators.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  'Technique Bouldering': 'bg-emerald-500',
  'Power Bouldering': 'bg-purple-500',
  'Arms': 'bg-rose-500',
  'Legs': 'bg-amber-500',
  'Core': 'bg-sky-500',
  'Other': 'bg-zinc-500'
};

/**
 * Default exercise definitions provided on first run.
 */
export const DEFAULT_EXERCISE_TYPES: ExerciseTypeDef[] = [
  { 
    id: 'free-bouldering', 
    name: 'Free Bouldering', 
    category: 'Technique Bouldering', 
    parameters: ['duration', 'grades', 'cadence', 'boulderingStyle'] 
  },
  { 
    id: 'non-free-bouldering', 
    name: 'Non-Free Bouldering', 
    category: 'Power Bouldering', 
    parameters: ['duration', 'variant', 'sets'] 
  },
  { 
    id: 'hangboard', 
    name: 'Hangboard', 
    category: 'Arms', 
    parameters: ['holdType', 'hangboardTimes', 'restTime', 'holdSize', 'weight'] 
  },
  { 
    id: 'campus-board', 
    name: 'Campus Board', 
    category: 'Power Bouldering', 
    parameters: ['duration', 'campusStyle'] 
  },
  { 
    id: 'core-training', 
    name: 'Core Training', 
    category: 'Core', 
    parameters: ['duration', 'difficulty'] 
  }
];

/**
 * Initial workout templates for each phase.
 */
export const DEFAULT_TEMPLATES: Record<PhaseType, Partial<Workout>[]> = {
  'Maintenance': [
    { notes: 'Maintenance Bouldering', exercises: [{ id: 1, type: 'Free Bouldering', duration: 90, boulderingType: 'Slab' }] },
    { notes: 'Maintenance Bouldering', exercises: [{ id: 2, type: 'Free Bouldering', duration: 90, boulderingType: 'Overhang' }] },
    { notes: 'Maintenance Bouldering', exercises: [{ id: 3, type: 'Free Bouldering', duration: 90, boulderingType: 'Slab' }] },
    { notes: 'Power & Strength', exercises: [
      { id: 4, type: 'Hangboard', holdType: 'Half Crimp', addedWeight: 10, rungSize: 20 },
      { id: 5, type: 'Core Training', duration: 20, difficulty: 7 }
    ]}
  ],
  'Endurance': [
    { notes: 'Volume Bouldering', exercises: [{ id: 1, type: 'Free Bouldering', duration: 120 }] },
    { notes: 'Volume Bouldering', exercises: [{ id: 2, type: 'Free Bouldering', duration: 120 }] },
    { notes: '4x4 Endurance', exercises: [{ id: 3, type: 'Non-Free Bouldering', variant: '4x4', sets: 4 }] },
    { notes: 'Core Training', exercises: [{ id: 4, type: 'Core Training', duration: 30, difficulty: 6 }] }
  ],
  'Strength': [
    { notes: 'Limit Bouldering', exercises: [{ id: 1, type: 'Free Bouldering', duration: 90, boulderingType: 'Overhang' }] },
    { notes: 'Hangboard Max Recruitment', exercises: [{ id: 2, type: 'Hangboard', holdType: 'Full Crimp', addedWeight: 20, rungSize: 20 }] },
    { notes: 'Limit Bouldering', exercises: [{ id: 3, type: 'Free Bouldering', duration: 90, boulderingType: 'Kilterboard' }] },
    { notes: 'Strength Core', exercises: [{ id: 4, type: 'Core Training', duration: 20, difficulty: 9 }] }
  ],
  'Power': [
    { notes: 'Power Bouldering', exercises: [{ id: 1, type: 'Free Bouldering', duration: 90, boulderingType: 'Dyno' }] },
    { notes: 'Campus Board', exercises: [{ id: 2, type: 'Campus Board', campusType: 'Jumps' }] },
    { notes: 'Power Bouldering', exercises: [{ id: 3, type: 'Free Bouldering', duration: 90, boulderingType: 'Moonboard' }] },
    { notes: 'Hangboard Power', exercises: [{ id: 4, type: 'Hangboard', holdType: 'Half Crimp', timeOn: 3, addedWeight: 30 }] }
  ],
  'Power Endurance': [
    { notes: 'Hard 4x4', exercises: [{ id: 1, type: 'Non-Free Bouldering', variant: '4x4', sets: 4 }] },
    { notes: 'Moonboard Intervals', exercises: [{ id: 2, type: 'Free Bouldering', duration: 60, boulderingType: 'Moonboard' }] },
    { notes: 'Hard 4x4', exercises: [{ id: 3, type: 'Non-Free Bouldering', variant: '4x4', sets: 4 }] },
    { notes: 'Core Training', exercises: [{ id: 4, type: 'Core Training', duration: 25, difficulty: 8 }] }
  ]
};
