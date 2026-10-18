export const DOCUMENT_SENSITIVITIES = ['normal', 'sensitive'] as const;
export type DocumentSensitivity = (typeof DOCUMENT_SENSITIVITIES)[number];

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

/** The `documents` bucket's `file_size_limit` (DOC-1). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type DocumentCategorySpec = {
  readonly sensitivity: DocumentSensitivity;
  /** The extraction schema P2-03 enqueues on upload, or null for none. */
  readonly extractionSchema: 'certificate_v1' | 'utility_bill_v1' | null;
  readonly mimeTypes: readonly DocumentMimeType[];
};

/**
 * SPEC §5.5's categories, in the order the upload sheet offers them: the papers Mẹ files most often first. Each id is
 * also its option in the `documents.category` message. `lease_contract` stays null until P3-19 adds `lease_v1`.
 */
export const DOCUMENT_CATEGORIES = {
  certificate: { sensitivity: 'sensitive', extractionSchema: 'certificate_v1', mimeTypes: DOCUMENT_MIME_TYPES },
  lease_contract: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  utility_bill: { sensitivity: 'normal', extractionSchema: 'utility_bill_v1', mimeTypes: DOCUMENT_MIME_TYPES },
  insurance: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  tax_receipt: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  sale_contract: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  invoice_receipt: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  building_permit: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  drawing: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  handover: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  photo: { sensitivity: 'normal', extractionSchema: null, mimeTypes: IMAGE_MIME_TYPES },
  id_card: { sensitivity: 'sensitive', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
  other: { sensitivity: 'normal', extractionSchema: null, mimeTypes: DOCUMENT_MIME_TYPES },
} as const satisfies Record<string, DocumentCategorySpec>;

export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

export const DOCUMENT_CATEGORY_IDS = Object.keys(DOCUMENT_CATEGORIES) as DocumentCategory[];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return Object.hasOwn(DOCUMENT_CATEGORIES, value);
}

export function acceptsMime(category: DocumentCategory, mime: string): mime is DocumentMimeType {
  return (DOCUMENT_CATEGORIES[category].mimeTypes as readonly string[]).includes(mime);
}
