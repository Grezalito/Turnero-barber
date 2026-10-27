export type BonusTierCode = 'NONE' | 'TIER_15' | 'TIER_35' | 'TIER_50';
export interface WeeklyGoalMetrics {
    week_start: string;
    week_end: string;
    confirmed_count: number;
    current_target: number;
    display_counter: string;
    progress_percentage: number;
    overall_progress_percentage: number;
    tier: BonusTierCode;
    tier_label: string;
    earned_bonus_ars: number;
    next_bonus_ars: number;
    remaining_for_next_tier: number;
    reminder_ia_bonified: boolean;
}
export declare const WEEKLY_BONUS_TIERS: ({
    target: number;
    bonusArs: number;
    reminderBonified: boolean;
    code: "TIER_15";
} | {
    target: number;
    bonusArs: number;
    reminderBonified: boolean;
    code: "TIER_35";
} | {
    target: number;
    bonusArs: number;
    reminderBonified: boolean;
    code: "TIER_50";
})[];
export declare function getWeekBoundsUtc(referenceDate?: Date): {
    weekStart: Date;
    weekEnd: Date;
};
export declare function calculateWeeklyGoalMetrics(confirmedCount: number, referenceDate?: Date): WeeklyGoalMetrics;
