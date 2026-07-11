import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CourierServiceBrunei() {
  useEffect(() => {
    document.title = "Courier Service Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Courier Service in Brunei — Fast & Reliable
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Send parcels anywhere in Brunei with confidence. TOMUPRO is a trusted courier service connecting you to a
            network of verified drivers for same-day and next-day delivery across all districts.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            What Makes a Great Courier Service
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            A courier service is more than just moving a parcel from one location to another. It
            involves timely pickup, careful handling, accurate tracking, and reliable delivery to
            the recipient. In Brunei, where businesses increasingly depend on fast fulfilment to
            meet customer expectations, having a dependable courier partner is essential. Whether
            you are sending documents between offices, delivering products to buyers, or shipping
            items across districts, the quality of your courier service directly impacts your
            reputation.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. Our courier
            service is designed for both businesses and individuals who need parcels delivered
            quickly and safely. You book a delivery through our platform, a nearby driver is
            assigned within minutes, and the parcel is picked up and delivered with full tracking
            visibility from start to finish.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Same-Day and Next-Day Courier Delivery
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Speed matters in courier delivery. Many customers expect their orders to arrive the
            same day or the next morning. With TOMUPRO, parcels booked before the daily cut-off
            time are delivered the same day within the pickup district. For cross-district
            deliveries, next-day arrival is standard. Our routing system assigns the most efficient
            driver based on proximity, current workload, and destination, ensuring your parcel
            does not sit idle waiting for a batch.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Every delivery includes real-time tracking that both the sender and recipient can
            access. You will know when your parcel has been picked up, when it is in transit, and
            when it arrives. For business senders handling multiple parcels daily, our dashboard
            provides a consolidated view of all active and completed deliveries so nothing slips
            through the cracks.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Coverage Across All Four Districts
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Our courier network covers Brunei-Muara, Tutong, Belait, and Temburong. Whether you
            are sending a parcel within Bandar Seri Begawan or shipping to Kuala Belait, we have
            drivers positioned across the country to handle your delivery. Businesses no longer
            need to turn away customers in other districts or rely on informal arrangements to
            get parcels across the country.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For personal senders, our platform is equally straightforward. You do not need a
            business account to use the service. Simply enter pickup and delivery details, select
            your preferred timing, and let our system handle the rest. Pricing is transparent
            with no hidden fees, and you can see the delivery cost before confirming the booking. Cash on delivery (COD) is fully supported for businesses that need payment collection at the door.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/same-day-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Same Day Delivery Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Express delivery for urgent parcels</p>
            </Link>
            <Link to="/parcel-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Parcel Delivery Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Safe and tracked parcel delivery</p>
            </Link>
            <Link to="/last-mile-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Last Mile Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Get products to your customers fast</p>
            </Link>
            <Link to="/blog/best-delivery-service-ecommerce-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Best Delivery for eCommerce</p>
              <p className="text-xs text-[#64748B] mt-1">Guide to choosing delivery in Brunei</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-[#0F172A] text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Send Your First Parcel Today
          </h2>
          <p className="text-gray-300 mb-8">
            Join hundreds of businesses and individuals using TOMUPRO for reliable courier service across Brunei.
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
