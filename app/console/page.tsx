import { SiteHeader } from '../components/site-header';
import { Console } from './console';

export const dynamic = 'force-dynamic';

// Approval links in Zapier notifications point at /console?case=<id>.
export default async function ConsolePage({ searchParams }: PageProps<'/console'>) {
  const { case: caseId } = await searchParams;
  const initialCase = typeof caseId === 'string' && /^[0-9a-f-]{36}$/i.test(caseId) ? caseId : null;
  return (
    <>
      <SiteHeader />
      <Console initialCase={initialCase} />
    </>
  );
}
