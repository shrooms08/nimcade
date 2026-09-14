/** Tip amounts offered in the tip sheet, in NIM. */
export const TIP_PRESETS_NIM = [1, 5, 10] as const

export type TipAmount = (typeof TIP_PRESETS_NIM)[number]

export const DEFAULT_TIP_NIM: TipAmount = 5
