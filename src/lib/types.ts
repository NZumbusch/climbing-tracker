export type PhaseType = 'Endurance' | 'Strength' | 'Power' | 'Power Endurance' | 'Maintenance';

export type ExerciseCategory = 'Arms' | 'Legs' | 'Core' | 'Technique Bouldering' | 'Power Bouldering' | 'Other';

export type ParameterBlock = 
  | 'duration' 
  | 'grades' 
  | 'cadence' 
  | 'boulderingStyle' 
  | 'variant' 
  | 'sets' 
  | 'holdType' 
  | 'hangboardTimes' 
  | 'restTime' 
  | 'holdSize' 
  | 'weight' 
  | 'campusStyle' 
  | 'difficulty';

export interface ExerciseTypeDef {
  id: string;
  name: string;
  category: ExerciseCategory;
  parameters: ParameterBlock[];
}

export interface Exercise {
  id: number;
  type: string;
  duration?: number;
  
  // Technique / Bouldering
  minGrade?: string;
  maxGrade?: string;
  cadence?: number; // min/boulder
  boulderingType?: 'Kilterboard' | 'Moonboard' | 'Slab' | 'Overhang' | 'Dyno';
  
  // Non-Free / General
  variant?: string; // 4x4, EMOM, etc.
  sets?: number;
  
  // Specific / Hangboard / Weights
  holdType?: 'Crimp' | 'Half Crimp' | 'Full Crimp' | 'Open Hand' | 'Sloper' | 'Pocket';
  timeOn?: number;
  timeOff?: number;
  timeBetweenSets?: number;
  addedWeight?: number;
  rungSize?: number;
  
  // Campus
  campusType?: 'Jumps' | 'One Arm Ladders';
  
  // Core / RPE
  difficulty?: number; // 1-10
}

export interface Workout {
  id: number;
  status: 'planned' | 'completed';
  date: string | null;
  weekId: string; // ISO-8601 Week ID: YYYY-Www
  notes: string;
  loadFactor: number;
  exercises: Exercise[];
  
  // Fatigue Metrics (Perceived Exertion)
  fingers?: number; // 1-10
  core?: number;    // 1-10
  systemic?: number; // 1-10
}

/**
 * Calculates the stress/load factor of a workout based on duration and RPE.
 */
export function calculateLoadFactor(duration: number, fingers: number, core: number, systemic: number): number {
  const avgFatigue = (fingers + core + systemic) / 3;
  return (duration || 60) * avgFatigue;
}

export interface PeriodizationWeek {
  weekId: string;
  phase: PhaseType;
  customized?: boolean;
}

export interface TrainingData {
  workouts: Workout[];
  periodization: PeriodizationWeek[];
  exerciseTypes: ExerciseTypeDef[];
  templates: Record<PhaseType, Partial<Workout>[]>;
}
