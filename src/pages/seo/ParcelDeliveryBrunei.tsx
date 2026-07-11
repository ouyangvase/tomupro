import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ParcelDeliveryBrunei() {
  useEffect(() => {
    document.title = "Parcel Delivery Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Parcel Delivery Service in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Send packages safely across Brunei with real-time tracking and transparent pricing.
            TOMUPRO handles parcels of all sizes with care and speed.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Types of Parcels We Handle
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Whether you need to send a small envelope, a boxed product, or a bulky item,
            TOMUPRO's parcel delivery service accommodates a wide range of package types.
            Documents, electronics, clothing, food items, household goods, and retail products
            are all handled regularly through our platform. Each parcel is treated with care
            from the moment it is picked up until it reaches the recipient's hands.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. We understand
            that different parcels have different handling requirements. Fragile items are flagged
            in our system so drivers take extra precautions. Temperature-sensitive packages are
            prioritised for faster delivery windows. Our drivers are trained to handle parcels
            professionally, and proof of delivery is captured for every completed drop-off.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Tracking and Pricing Transparency
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Every parcel sent through TOMUPRO receives a unique tracking reference. Both the
            sender and recipient can follow the delivery progress from pickup to completion.
            Automated notifications are sent at key stages including pickup confirmation, in-transit
            updates, and delivery confirmation. This eliminates the need for senders to manually
            update buyers about their order status and reduces enquiries about delivery timing.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Pricing on TOMUPRO is straightforward and visible before you confirm any booking.
            The delivery fee is calculated based on distance between pickup and drop-off
            locations, with no hidden surcharges. You see the exact cost upfront, making it easy
            to factor delivery into your product pricing or pass it on to customers transparently.
            For businesses sending multiple parcels daily, volume-based arrangements are available
            to keep costs predictable.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            District Coverage and Safe Handling
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Our delivery network spans all four districts of Brunei: Brunei-Muara, Tutong,
            Belait, and Temburong. Parcels moving within the same district typically arrive
            the same day, while cross-district deliveries are completed by the next business day.
            The coverage ensures that businesses based anywhere in Brunei can serve customers
            nationwide without worrying about delivery limitations.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Safe handling is a priority at every stage. Drivers are instructed to keep parcels
            secure during transit, and our system captures photographic proof of delivery so
            both parties have a record. For high-value items, additional verification steps can
            be enabled at delivery. Whether you are sending one parcel a week or fifty a day,
            every package receives the same level of attention and tracking accuracy.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/courier-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Courier Service Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Fast and reliable courier delivery</p>
            </Link>
            <Link to="/same-day-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Same Day Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Express delivery within hours</p>
            </Link>
            <Link to="/logistics-company-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Company Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Full logistics solutions for businesses</p>
            </Link>
            <Link to="/delivery-app-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery App Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Manage all deliveries from one platform</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-[#0F172A] text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Send Parcels With Confidence
          </h2>
          <p className="text-gray-300 mb-8">
            Track every parcel from pickup to delivery. Start using TOMUPRO for safe, transparent parcel delivery.
          </p>
          <Link to="/auth">
            <Button className="bg-[#B8860B] hover:bg-[#9A7209] text-white px-8 py-3 text-lg">
              Start Now <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer Link */}
      <footer className="py-8 px-6 text-center">
        <Link to="/" className="text-[#B8860B] hover:underline text-sm">
          Back to Home
        </Link>
      </footer>
    </div>
  );
}
