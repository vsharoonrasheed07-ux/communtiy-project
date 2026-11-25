import { DropoutReason } from '@prisma/client';

export interface SchemeSuggestion {
  id: string;
  name: string;
  category: 'SCHOLARSHIP' | 'BICYCLE' | 'MEAL' | 'TRANSPORT' | 'COUNSELLING' | 'PROTECTION';
  description: string;
  eligibilityReason: string;
  benefit: string;
  priority: 'HIGH' | 'MEDIUM';
}

export interface SchemeStudentInput {
  pendingFees: boolean;
  distanceKm: number;
  flagMigration: boolean;
  flagHealth: boolean;
  flagChildLabour: boolean;
  flagEarlyMarriage: boolean;
  attendanceRate: number;
  averageMarks: number;
  gender: string;
  dropoutReason?: DropoutReason | null;
}

/**
 * Matches government & school welfare schemes to a student based on risk factors & dropout reason.
 */
export function matchSchemesForStudent(student: SchemeStudentInput): SchemeSuggestion[] {
  const suggestions: SchemeSuggestion[] = [];

  if (student.pendingFees || student.dropoutReason === 'FEES' || student.dropoutReason === 'WORK') {
    suggestions.push({
      id: 'pre-matric-scholarship',
      name: 'Pre-Matric Merit & Means Scholarship',
      category: 'SCHOLARSHIP',
      description: 'Annual tuition waiver and book/uniform allowance for families facing financial hardship.',
      eligibilityReason: student.pendingFees
        ? 'Student has pending school fees'
        : `Dropout/risk linked to ${student.dropoutReason?.toLowerCase()}`,
      benefit: 'Fee waiver + ₹3,500/year learning stipend',
      priority: 'HIGH',
    });
  }

  if (student.distanceKm >= 3.0 || student.dropoutReason === 'DISTANCE') {
    suggestions.push({
      id: 'free-bicycle-scheme',
      name: 'State Free Bicycle Distribution Scheme',
      category: 'BICYCLE',
      description: 'Provides a free bicycle to students travelling 3 km or more to school.',
      eligibilityReason: `Home distance is ${student.distanceKm.toFixed(1)} km from school`,
      benefit: 'Free bicycle + safety helmet',
      priority: 'HIGH',
    });

    suggestions.push({
      id: 'bus-transport-pass',
      name: 'Student Free Bus & Transport Pass',
      category: 'TRANSPORT',
      description: 'Zero-cost state transit pass or school shuttle voucher for remote wards.',
      eligibilityReason: `Commute distance (${student.distanceKm.toFixed(1)} km) creates attendance friction`,
      benefit: '100% subsidized monthly transit pass',
      priority: 'MEDIUM',
    });
  }

  if (
    student.attendanceRate < 80 ||
    student.flagHealth ||
    student.flagMigration ||
    student.dropoutReason === 'HEALTH'
  ) {
    suggestions.push({
      id: 'mid-day-meal-plus',
      name: 'PM POSHAN Mid-Day Meal & Iron Supplementation',
      category: 'MEAL',
      description: 'Daily hot nutritious lunch plus weekly iron-folic supplements and health checkups.',
      eligibilityReason: student.flagHealth
        ? 'Health risk flag recorded'
        : 'Improves daily attendance and nutrition retention',
      benefit: 'Daily cooked meal + quarterly health screening',
      priority: student.flagHealth ? 'HIGH' : 'MEDIUM',
    });
  }

  if (student.flagMigration || student.dropoutReason === 'MIGRATION') {
    suggestions.push({
      id: 'migrant-bridge-hostel',
      name: 'Seasonal Migrant Student Hostel & Bridge Course',
      category: 'COUNSELLING',
      description: 'Residential hostel seat or seasonal bridge classes when families migrate for work.',
      eligibilityReason: 'Seasonal migration flag / dropout reason recorded',
      benefit: 'Seasonal hostel placement + catch-up tutoring',
      priority: 'HIGH',
    });
  }

  if (student.flagChildLabour || student.flagEarlyMarriage || student.dropoutReason === 'MARRIAGE') {
    suggestions.push({
      id: 'child-protection-stipend',
      name: 'Child Protection & Conditional Retention Stipend',
      category: 'PROTECTION',
      description: 'District child-welfare coordination, guardian counselling, and monthly conditional retention grant.',
      eligibilityReason: student.flagEarlyMarriage
        ? 'Early marriage risk flag recorded'
        : 'Child labour risk flag recorded',
      benefit: 'Caseworker support + ₹1,000/month retention grant',
      priority: 'HIGH',
    });
  }

  if (student.gender.toLowerCase() === 'female' && (student.pendingFees || student.distanceKm >= 2.5 || student.flagEarlyMarriage)) {
    suggestions.push({
      id: 'girls-retention-grant',
      name: 'Kasturba / State Girls Retention Incentive',
      category: 'SCHOLARSHIP',
      description: 'Targeted incentive supporting adolescent girls to complete secondary schooling.',
      eligibilityReason: 'Eligible female student with retention risk factors',
      benefit: 'Annual scholarship + menstrual hygiene & mentoring kit',
      priority: 'MEDIUM',
    });
  }

  if (student.averageMarks < 40 || student.dropoutReason === 'NO_INTEREST') {
    suggestions.push({
      id: 'remedial-learning-camp',
      name: 'Remedial Peer-Learning & Career Club',
      category: 'COUNSELLING',
      description: 'After-school foundational literacy/numeracy mentoring and activity clubs.',
      eligibilityReason: `Academic support needed (avg ${Math.round(student.averageMarks)}%)`,
      benefit: '4 hours/week small-group tutoring',
      priority: 'MEDIUM',
    });
  }

  return suggestions;
}
