/**
 * JSON Schema for job descriptions
 */
const jobSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  additionalProperties: false,
  definitions: {
    iso8601: {
      type: 'string',
      description:
        'Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04',
      pattern:
        '^([1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]|[1-2][0-9]{3}-[0-1][0-9]|[1-2][0-9]{3})$',
    },
  },
  properties: {
    title: {
      type: 'string',
      description: 'e.g. Web Developer',
    },
    company: {
      type: 'string',
      description: 'Microsoft',
    },
    type: {
      type: 'string',
      description: 'Full-time, part-time, contract, etc.',
    },
    date: {
      $ref: '#/definitions/iso8601',
    },
    description: {
      type: 'string',
      description: 'Write a short description about the job',
    },
    location: {
      type: 'object',
      additionalProperties: true,
      properties: {
        address: {
          type: 'string',
          description:
            'To add multiple address lines, use \\n. For example, 1234 Glücklichkeit Straße\\nHinterhaus 5. Etage li.',
        },
        postalCode: {
          type: 'string',
        },
        city: {
          type: 'string',
        },
        countryCode: {
          type: 'string',
          description: 'code as per ISO-3166-1 ALPHA-2, e.g. US, AU, IN',
        },
        region: {
          type: 'string',
          description:
            'The general region where you live. Can be a US state, or a province, for instance.',
        },
      },
    },
    remote: {
      type: 'string',
      description: 'the level of remote work available',
      enum: ['Full', 'Hybrid', 'None'],
    },
    salary: {
      type: 'string',
      description: '100000',
    },
    experience: {
      type: 'string',
      description: 'Senior or Junior or Mid-level',
    },
    responsibilities: {
      type: 'array',
      description: 'what the job entails',
      additionalItems: false,
      items: {
        type: 'string',
        description: 'e.g. Build out a new API for our customer base.',
      },
    },
    qualifications: {
      type: 'array',
      description: 'List out your qualifications',
      additionalItems: false,
      items: {
        type: 'string',
        description: 'undergraduate degree, etc.  ',
      },
    },
    skills: {
      type: 'array',
      description: 'List out your professional skill-set',
      additionalItems: false,
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: {
            type: 'string',
            description: 'e.g. Web Development',
          },
          level: {
            type: 'string',
            description: 'e.g. Master',
          },
          keywords: {
            type: 'array',
            description: 'List some keywords pertaining to this skill',
            additionalItems: false,
            items: {
              type: 'string',
              description: 'e.g. HTML',
            },
          },
        },
      },
    },
    facets: {
      type: 'object',
      description:
        'Hard-filter facets. STRICT provenance: use unspecified/absent when the post does not say — never guess.',
      additionalProperties: false,
      properties: {
        remote_scope: {
          type: 'string',
          enum: [
            'onsite',
            'hybrid',
            'remote_region',
            'remote_global',
            'unspecified',
          ],
          description:
            'remote_global ONLY if explicitly worldwide/anywhere; geo-fenced remote = remote_region',
        },
        remote_regions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Regions when remote_region, e.g. ["US"], ["EU"], ["Americas"]',
        },
        timezone_range: {
          type: 'string',
          description: 'Only when stated, e.g. "UTC-8 to UTC-5"',
        },
        seniority: {
          type: 'string',
          enum: [
            'intern',
            'junior',
            'mid',
            'senior',
            'staff_plus',
            'lead_management',
            'unspecified',
          ],
        },
        salary_provenance: {
          type: 'string',
          enum: ['stated', 'inferred', 'absent'],
          description: 'stated ONLY when concrete numbers appear in the post',
        },
        visa_sponsorship: {
          type: 'string',
          enum: ['yes', 'no', 'unspecified'],
        },
        employment_type: {
          type: 'string',
          enum: [
            'full_time',
            'part_time',
            'contract',
            'internship',
            'cofounder',
            'unspecified',
          ],
        },
      },
    },
    meta: {
      type: 'object',
      description:
        'The schema version and any other tooling configuration lives here',
      additionalProperties: true,
      properties: {
        canonical: {
          type: 'string',
          description:
            'URL (as per RFC 3986) to latest version of this document',
          format: 'uri',
        },
        version: {
          type: 'string',
          description: 'A version field which follows semver - e.g. v1.0.0',
        },
        lastModified: {
          type: 'string',
          description: 'Using ISO 8601 with YYYY-MM-DDThh:mm:ss',
        },
      },
    },
  },
  title: 'Resume Schema',
  type: 'object',
};

module.exports = jobSchema;
