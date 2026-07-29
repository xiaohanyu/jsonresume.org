const { z } = require('zod');

/**
 * Zod schema for job description to JSON conversion (AI SDK)
 * Uses .nullable() for OpenAI structured output compatibility —
 * OpenAI requires all properties in `required`; nullable allows null values.
 */
const jobDescriptionSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z
    .object({
      address: z.string().nullable(),
      postalCode: z.string().nullable(),
      city: z.string().nullable(),
      countryCode: z.string().nullable(),
      region: z.string().nullable(),
    })
    .nullable(),
  position: z.string().nullable(),
  type: z.string().nullable(),
  salary: z.string().nullable(),
  salary_structured: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
      period: z.string().nullable(),
    })
    .nullable(),
  date: z.string().nullable(),
  remote: z.string().nullable(),
  visa_sponsorship: z.string().nullable(),
  equity: z.string().nullable(),
  description: z.string().nullable(),
  responsibilities: z.array(z.string()).nullable(),
  qualifications: z.array(z.string()).nullable(),
  skills: z
    .array(
      z.object({
        name: z.string().nullable(),
        level: z.string().nullable(),
        keywords: z.array(z.string()).nullable(),
      })
    )
    .nullable(),
  experience: z.string().nullable(),
  education: z.string().nullable(),
  application: z.string().nullable(),
  facets: z
    .object({
      remote_scope: z
        .enum([
          'onsite',
          'hybrid',
          'remote_region',
          'remote_global',
          'unspecified',
        ])
        .nullable(),
      remote_regions: z.array(z.string()).nullable(),
      timezone_range: z.string().nullable(),
      seniority: z
        .enum([
          'intern',
          'junior',
          'mid',
          'senior',
          'staff_plus',
          'lead_management',
          'unspecified',
        ])
        .nullable(),
      salary_provenance: z.enum(['stated', 'inferred', 'absent']).nullable(),
      visa_sponsorship: z.enum(['yes', 'no', 'unspecified']).nullable(),
      employment_type: z
        .enum([
          'full_time',
          'part_time',
          'contract',
          'internship',
          'cofounder',
          'unspecified',
        ])
        .nullable(),
    })
    .nullable(),
});

/**
 * Facet-only schema for the cheap backfill pass (facet-backfill.js) —
 * identical facet shape, no other fields.
 */
const facetsOnlySchema = z.object({
  facets: jobDescriptionSchema.shape.facets,
});

/**
 * AI SDK tool definition for job description parsing
 * Using Zod schema for type safety and automatic JSON Schema conversion
 */
const jobDescriptionTool = {
  description: 'Takes a fluid job description and turns it into a JSON schema',
  parameters: jobDescriptionSchema,
};

module.exports = {
  jobDescriptionSchema,
  jobDescriptionTool,
  facetsOnlySchema,
};
