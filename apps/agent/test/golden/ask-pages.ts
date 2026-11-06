import { mcpToolName } from '../../src/tools/server';

export const RATE_URL = 'https://tin-demo.example/lai-suat-vay-mua-nha';
export const LAND_URL = 'https://tin-demo.example/lai-suat-vay-mua-dat';
export const PROCEDURE_URL = 'https://demo.gov.vn/thu-tuc-sang-ten-so-do';

export const webSearch = (query: string, ...urls: string[]) => ({ name: 'WebSearch', input: { query }, result: { results: [{ content: urls.map((url) => ({ url })) }] } });
export const webFetch = (url: string, text: string) => ({ name: 'WebFetch', input: { url, prompt: 'Publication date line and the figures, copied exactly' }, result: { code: 200, result: text, url } });
export const quotePage = (url: string, quotes: string[]) => ({ name: mcpToolName('quote_page'), input: { url, quotes } });

/** What WebFetch returned for each hand-written page; the recordings quote these texts word for word. */
export const PAGE_TEXT = {
  [RATE_URL]: 'Publication date: 05/10/2026\nLãi suất cho vay mua nhà từ 7,5% một năm đối với khoản vay có tài sản bảo đảm. Mức thực tế thay đổi theo từng ngân hàng và kỳ hạn vay.',
  [LAND_URL]: 'Publication date: 06/10/2026\nLãi suất cho vay mua đất nền từ 9% một năm, cao hơn vay mua nhà vì tài sản chưa có công trình.',
  [PROCEDURE_URL]: 'Publication date: 01/10/2026\nHồ sơ sang tên gồm đơn đăng ký biến động, hợp đồng chuyển nhượng đã được công chứng và bản sao giấy tờ tùy thân của các bên.',
} as const;
