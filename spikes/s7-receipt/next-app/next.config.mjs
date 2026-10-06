export default {
  serverExternalPackages: ['@resvg/resvg-js', '@react-pdf/renderer', 'satori'],
  outputFileTracingIncludes: {
    '/api/receipt/[id]': ['./fonts/**'],
    '/api/receipt-reactpdf/[id]': ['./fonts/**'],
  },
  typescript: { ignoreBuildErrors: true },
};
