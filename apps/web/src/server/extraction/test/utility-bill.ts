import { reviewFields } from '@esta/core/extraction/fields';
import { randomBytes, randomUUID } from 'node:crypto';
import billTruthFile from '../../../../../../fixtures/utility-bills/electricity-q7-scan/truth.json';

/** Where a waiting bill is filed: the lane's household and property, and the list its documents are cleaned up from. */
export type BillLane = {
  readonly household: string;
  readonly propertyId: string;
  readonly documents: string[];
  /** A service-role request to the stack's REST API, from the integration test (this folder must not reach for the stack itself, #122). */
  readonly rest: <T>(path: string, init?: RequestInit) => Promise<T>;
};

export const BILL_TEXT = 'ĐIỆN LỰC DEMO TÂN THUẬN. HÓA ĐƠN TIỀN ĐIỆN tháng 9/2026. Tổng cộng 1.234.764 đ';
export const billTruth = billTruthFile;
const billResult = (fullText: string) => ({ ...billTruthFile.bill, full_text: fullText });
export const acceptBill = Object.fromEntries(reviewFields('utility_bill_v1', billTruthFile.bill).map((field) => [field.path, { kind: 'accepted' }]));

/** A utility bill whose read waits for review, with the printed text the worker keeps beside the fields. */
export async function waitingBill(lane: BillLane, sensitivity: 'normal' | 'sensitive', fullText = BILL_TEXT): Promise<{ documentId: string; extractionId: string }> {
  const documentId = randomUUID();
  const extractionId = randomUUID();
  lane.documents.push(documentId);
  await lane.rest('documents', {
    method: 'POST',
    body: JSON.stringify({
      id: documentId,
      household_id: lane.household,
      property_id: lane.propertyId,
      category: 'utility_bill',
      title: 'Hóa đơn điện Demo',
      storage_path: `${lane.household}/${documentId}/hoa-don.pdf`,
      mime: 'application/pdf',
      size_bytes: 1000,
      sha256: randomBytes(32).toString('hex'),
      sensitivity,
    }),
  });
  await lane.rest('document_extractions', {
    method: 'POST',
    body: JSON.stringify({ id: extractionId, household_id: lane.household, document_id: documentId, schema_name: 'utility_bill_v1', schema_version: 1 }),
  });
  await lane.rest(`document_extractions?id=eq.${extractionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'running' }) });
  await lane.rest(`document_extractions?id=eq.${extractionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'needs_review', result: billResult(fullText), model: 'replay' }) });
  return { documentId, extractionId };
}

export const ocrText = async (lane: BillLane, documentId: string) => (await lane.rest<{ ocr_text: string | null }[]>(`documents?id=eq.${documentId}&select=ocr_text`))[0]?.ocr_text;

