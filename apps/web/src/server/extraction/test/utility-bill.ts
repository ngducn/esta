import { reviewFields } from '@esta/core/extraction/fields';
import { randomBytes, randomUUID } from 'node:crypto';
import billTruth from '../../../../../../fixtures/utility-bills/electricity-q7-scan/truth.json';
import { service } from '@/test/stack';

const rest = <T>(path: string, init?: RequestInit) => service<T>(`/rest/v1/${path}`, init);
const patch = (path: string, body: unknown) => rest(path, { method: 'PATCH', body: JSON.stringify(body) });

/** Where a waiting bill is filed: the lane's household and property, and the list its documents are cleaned up from. */
export type BillLane = { readonly household: string; readonly propertyId: string; readonly documents: string[] };

export const BILL_TEXT = 'ĐIỆN LỰC DEMO TÂN THUẬN. HÓA ĐƠN TIỀN ĐIỆN tháng 9/2026. Tổng cộng 1.234.764 đ';
const billResult = (fullText: string) => ({ ...billTruth.bill, full_text: fullText });
export const acceptBill = Object.fromEntries(reviewFields('utility_bill_v1', billTruth.bill).map((field) => [field.path, { kind: 'accepted' }]));

/** A utility bill whose read waits for review, with the printed text the worker keeps beside the fields. */
export async function waitingBill(lane: BillLane, sensitivity: 'normal' | 'sensitive', fullText = BILL_TEXT): Promise<{ documentId: string; extractionId: string }> {
  const documentId = randomUUID();
  const extractionId = randomUUID();
  lane.documents.push(documentId);
  await rest('documents', {
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
  await rest('document_extractions', {
    method: 'POST',
    body: JSON.stringify({ id: extractionId, household_id: lane.household, document_id: documentId, schema_name: 'utility_bill_v1', schema_version: 1 }),
  });
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'running' });
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'needs_review', result: billResult(fullText), model: 'replay' });
  return { documentId, extractionId };
}

export const ocrText = async (documentId: string) => (await rest<{ ocr_text: string | null }[]>(`documents?id=eq.${documentId}&select=ocr_text`))[0]?.ocr_text;

