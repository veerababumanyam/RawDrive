import { z } from 'zod';
/**
 * Hex color schema
 */
export declare const hexColorSchema: z.ZodString;
/**
 * UUID v4 schema
 */
export declare const uuidSchema: z.ZodString;
/**
 * Email schema
 */
export declare const emailSchema: z.ZodString;
/**
 * Color stop schema for gradients
 */
export declare const colorStopSchema: z.ZodObject<{
    color: z.ZodString;
    position: z.ZodNumber;
}, z.core.$strip>;
/**
 * Gradient configuration schema
 */
export declare const gradientConfigSchema: z.ZodObject<{
    type: z.ZodLiteral<"linear">;
    preset_id: z.ZodNullable<z.ZodString>;
    direction: z.ZodNumber;
    colors: z.ZodArray<z.ZodObject<{
        color: z.ZodString;
        position: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Pagination query schema
 */
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
//# sourceMappingURL=schemas.d.ts.map