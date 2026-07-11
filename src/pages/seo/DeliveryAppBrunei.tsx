import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeliveryAppBrunei() {
  useEffect(() => {
    document.title = "Delivery App Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Delivery App for Businesses in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Replace WhatsApp groups and spreadsheets with a purpose-built delivery platform.
            TOMUPRO gives businesses in Brunei a modern system to manage all deliveries in one place.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Why Businesses Need a Delivery App
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Many businesses in Brunei still coordinate deliveries through WhatsApp messages,
            phone calls, and manual spreadsheets. This works when you handle a few deliveries
            per day, but quickly becomes chaotic as volume grows. Messages get buried, addresses
            are misread, drivers forget pickups, and there is no central record of what was
            delivered and when. The result is lost parcels, unhappy customers, and wasted time
            spent on coordination instead of growing the business.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. It replaces
            fragmented communication with a single system where orders are created, drivers are
            assigned automatically, routes are optimised, and every delivery is tracked from
            start to finish. Business owners get a clear dashboard showing all pending,
            in-progress, and completed deliveries without needing to chase updates from drivers.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Features That Make Operations Easier
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            The TOMUPRO platform includes real-time driver tracking, automated dispatch, route
            optimisation, delivery notifications, proof of delivery capture, and cash on delivery
            reconciliation. Drivers access their assignments through a mobile-friendly interface
            that shows pickup locations, delivery addresses, and navigation assistance. They
            update delivery status with a tap, and the system notifies both the business and
            the customer automatically.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For business managers, the dashboard provides performance metrics including delivery
            success rates, average delivery times, driver utilisation, and cost per delivery.
            These insights help you identify bottlenecks, reward high performers, and make
            data-driven decisions about your delivery operations. Everything runs in real time
            so you always have an accurate picture of your logistics performance.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Better Than Manual Coordination
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            The difference between using a delivery app and manual coordination becomes clear
            as your business scales. With TOMUPRO, adding ten more deliveries to your day does
            not mean ten more phone calls or messages. The system handles assignment and routing
            automatically. New drivers can be onboarded and productive within minutes rather than
            days. Historical data is preserved so you can audit past deliveries, resolve disputes
            with evidence, and track trends over weeks and months.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Compared to generic messaging apps, a dedicated delivery platform eliminates
            miscommunication. Addresses are structured and validated. Driver assignments are
            clear and acknowledged. Delivery timelines are enforced by the system rather than
            relying on memory. For any business in Brunei that handles regular deliveries,
            switching from manual coordination to TOMUPRO means fewer errors, faster deliveries,
            and happier customers.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/delivery-management-system" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery Management System</p>
              <p className="text-xs text-[#64748B] mt-1">Automate dispatch and track every order</p>
            </Link>
            <Link to="/logistics-company-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Company Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Full logistics solutions for businesses</p>
            </Link>
            <Link to="/ecommerce-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">eCommerce Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Delivery solutions for online sellers</p>
            </Link>
            <Link to="/courier-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Courier Service Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Fast and reliable parcel courier</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-[#0F172A] text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Upgrade Your Delivery Operations
          </h2>
          <p className="text-gray-300 mb-8">
            Stop juggling messages and start managing deliveries properly. Try TOMUPRO today.
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
