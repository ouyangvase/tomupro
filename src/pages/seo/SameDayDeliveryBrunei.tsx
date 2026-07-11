import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SameDayDeliveryBrunei() {
  useEffect(() => {
    document.title = "Same Day Delivery Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Same Day Delivery in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Get your orders delivered within hours, not days. TOMUPRO offers express
            same-day delivery across Brunei with trusted courier drivers and full cash on delivery support for businesses that cannot afford to keep
            customers waiting.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            How Same-Day Delivery Works
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Same-day delivery means your parcel is picked up and delivered to the recipient
            within the same calendar day. On TOMUPRO, orders submitted before the morning
            cut-off are assigned to a driver immediately and delivered by evening. For orders
            placed in the afternoon, delivery is completed within a few hours depending on
            distance and driver availability. The system automatically prioritises urgent
            deliveries and routes drivers efficiently to meet tight timelines.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. Our same-day
            service is built for speed without sacrificing reliability. Each delivery is tracked
            in real time so both the sender and recipient know exactly where the parcel is.
            Drivers receive optimised routes that account for traffic patterns and district
            boundaries, ensuring the fastest possible delivery window.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Why Businesses Choose Express Delivery
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            In eCommerce, delivery speed is one of the strongest competitive advantages. Buyers
            who receive their orders the same day are significantly more likely to purchase again.
            For food businesses, retail shops, and service providers, fast delivery is not a
            luxury but a necessity. A customer ordering lunch expects it within the hour. A
            buyer purchasing a gift needs it before an event. Same-day delivery turns these
            expectations into satisfied customers.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Businesses on Instagram, Shopee, and other platforms gain an edge when they can
            promise and deliver same-day fulfilment. It reduces cart abandonment, minimises
            cancellations, and generates positive reviews. With TOMUPRO, you do not need your
            own fleet or delivery staff. Simply book through the platform and our network of
            drivers handles the rest, letting you focus on sales and operations.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Coverage Areas and Cut-Off Times
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Same-day delivery is available across Brunei-Muara, Tutong, and Belait districts for
            orders placed before the cut-off time. Temburong deliveries are handled on a next-day
            basis due to distance and bridge logistics. Within the capital area, deliveries placed
            as late as early afternoon can still reach recipients the same evening. Our system
            clearly indicates availability at booking time so you always know what to expect.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For businesses with high daily volumes, we support batch scheduling where all orders
            are picked up in a single sweep and distributed throughout the day. COD payments are collected and reconciled automatically for every same-day delivery. This keeps costs
            manageable while maintaining speed. Whether you ship five parcels a day or fifty,
            TOMUPRO scales with your needs and ensures every delivery meets the promised timeline.
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
              <p className="text-xs text-[#64748B] mt-1">Fast and reliable parcel courier</p>
            </Link>
            <Link to="/ecommerce-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">eCommerce Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Delivery solutions for online sellers</p>
            </Link>
            <Link to="/delivery-app-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery App Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Manage deliveries from your phone</p>
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
            Deliver Faster, Win More Customers
          </h2>
          <p className="text-gray-300 mb-8">
            Start offering same-day delivery to your customers with TOMUPRO's express service.
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
