import type { AgentSchemaName } from '@esta/core/agent-schemas';

const LEAF_RULES = [
  'Every leaf is {"value": ..., "confidence": <0 to 1>, "page": <page number or null>}. Page numbers count the pages of the file from 1; an image is page 1.',
  'Copy names, addresses, codes and other text exactly as printed, with every Vietnamese diacritic.',
  'A value that is absent or unreadable, or printed as a lone "-" or a blank after its label, is {"value": null, "confidence": 0, "page": null}. An empty list is [].',
  'confidence is your probability that the value is exactly right. Handwritten values get confidence at most 0.6.',
  'Never write a full national ID number (CCCD, CMND, số định danh) anywhere: keep only its last 4 digits.',
];

const SCHEMAS: Record<AgentSchemaName, { readonly document: string; readonly shape: string; readonly rules: readonly string[] }> = {
  certificate_v1: {
    document: 'a Vietnamese land use right certificate (sổ đỏ, sổ hồng, giấy chứng nhận) or a handwritten land paper',
    shape:
      '{"form", "holders": [{"full_name", "birth_year", "id_last4", "address_text", "relation"}], "parcels": [{"parcel_no", "map_sheet_no", "address_text", "area_m2", "use_form", "purposes": [{"land_use_code", "area_m2", "term"}], "origin_text"}], "structures": [{"kind", "footprint_m2", "floor_area_m2", "floors", "structure_text", "completed_year", "ownership_term"}], "serial_no", "book_entry_no", "issued_on", "issued_by", "annotations": [{"date", "text", "kind"}], "has_qr", "notes_text"}',
    rules: [
      'form is one of so_do_pre2009 (red "Giấy chứng nhận quyền sử dụng đất", land only, before 2009), so_hong_pre2009 ("Giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở", before 2009), gcn_2009_2024 (unified "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất"), gcn_2024 ("Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất", with a QR code), paper_only (no certificate: a handwritten or notarized paper).',
      'Holder names leave out titles such as Ông, Bà or Hộ ông. On paper_only, the holder is the person who receives the land. id_last4 is the last 4 digits of the holder\'s ID number.',
      'Areas are numbers in square metres; a decimal comma is a decimal point, so "125,5 m²" is 125.5 and "1.250,5 m²" is 1250.5. birth_year, floors and completed_year are integers.',
      'Dates are YYYY-MM-DD. issued_on is the date the authority issued the certificate; it is null when there is no certificate.',
      'land_use_code is the code as printed, such as ODT, ONT or CLN. term is the term of use as printed.',
      'annotations are the entries under "Những thay đổi sau khi cấp", with kind one of mortgage, mortgage_release, transfer, change_of_area, other. has_qr is true when a page carries a QR code. notes_text is the "Ghi chú" text verbatim, or null.',
    ],
  },
  utility_bill_v1: {
    document: 'a Vietnamese electricity, water or internet bill',
    shape: '{"kind", "provider", "customer_code", "holder_name", "address_text", "period", "amount_vnd", "consumption", "full_text"}',
    rules: [
      'kind is one of electricity, water, internet, other. provider is the company that issued the bill. customer_code is the "Mã khách hàng" exactly as printed.',
      'period is the month the bill charges for, as YYYY-MM. amount_vnd is the total to pay ("Tổng cộng tiền thanh toán") as an integer number of đồng, so "1.234.567 đ" is 1234567.',
      'consumption is the number of kWh or m³ used, as a number, or null for internet.',
      'full_text is a plain string, not a leaf: every line of printed text on the bill, in reading order, joined with newlines.',
    ],
  },
};

/**
 * The extract_document prompt. It names the file's SHA-256 so each file has its own replay recording, and it carries no
 * date, household or locale, so that recording replays at any clock for every household (AGENT.md §8).
 */
export function extractDocumentPrompt({
  schemaName,
  schemaVersion,
  filePath,
  sha256,
}: {
  readonly schemaName: AgentSchemaName;
  readonly schemaVersion: number;
  readonly filePath: string;
  readonly sha256: string;
}): string {
  const schema = SCHEMAS[schemaName];
  return [
    'Bạn là Trợ lý của ứng dụng Esta, giúp một gia đình quản lý bất động sản ở Việt Nam.',
    'You may only use the tools provided. Never invent amounts, dates, names or codes.',
    `Read the file ${filePath} with the Read tool. It is ${schema.document}. Its SHA-256 is ${sha256}.`,
    `Then call save_extraction once with {"result": <one JSON object for schema ${schemaName} version ${schemaVersion}>}. If it lists errors, fix exactly those fields and call it again. When it answers {"saved": true}, reply with one short sentence and nothing else.`,
    `The shape: ${schema.shape}`,
    'Rules:',
    ...[...LEAF_RULES, ...schema.rules].map((rule) => `- ${rule}`),
  ].join('\n');
}
