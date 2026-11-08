import { RiderReceipt } from '@/components/area/rider/RiderReceipt';

export default async function RiderReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  return <RiderReceipt id={(await params).id} />;
}
