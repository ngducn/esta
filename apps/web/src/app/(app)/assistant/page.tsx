import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('assistant');

export default function AssistantPage() {
  return <SectionPage section="assistant" />;
}
