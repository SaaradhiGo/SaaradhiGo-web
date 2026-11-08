import { RideTrip } from '@/components/area/rider/RideTrip';

export default async function RiderTripPage({ params }: { params: Promise<{ id: string }> }) {
  return <RideTrip id={(await params).id} />;
}
