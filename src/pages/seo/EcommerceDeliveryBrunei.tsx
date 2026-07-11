import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EcommerceDeliveryBrunei() {
  useEffect(() => {
    document.title = "eCommerce Delivery Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            eCommerce Delivery Solution in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Deliver orders from your online shop to customers across Brunei. TOMUPRO gives
            eCommerce sellers a reliable, trackable delivery system that scales with your business.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            The Delivery Challenge for Online Sellers
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Running an online shop in Brunei means handling delivery logistics alongside
            marketing, inventory, and customer service. Many sellers start by delivering orders
            themselves or relying on friends and family. As order volumes grow, this approach
            breaks down. Missed deliveries, late arrivals, and lost parcels damage your brand
            and lead to refund requests. Customers on Shopee, Instagram, and Facebook expect
            fast, trackable delivery as a standard, not a premium feature.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. We provide
            eCommerce sellers with a structured delivery system that handles everything from
            pickup scheduling to proof of delivery. Whether you process five orders a day or
            five hundred, our platform adapts to your volume and keeps every parcel accounted for.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            COD Support and Social Commerce Integration
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Cash on delivery remains one of the most popular payment methods for online
            purchases in Brunei. Brunei COD delivery requires careful handling — customers expect to pay at the door, and businesses need accurate reconciliation. TOMUPRO fully supports COD with automated cash reconciliation
            so you always know how much has been collected and when it will be settled back to
            you. Drivers collect payment at the door and the amount is recorded in the system
            immediately, eliminating disputes and confusion.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For sellers on Instagram and WhatsApp, our platform fits naturally into your workflow.
            You receive an order via DM, create a delivery booking on TOMUPRO, and the parcel
            is picked up from your location. Your buyer receives tracking updates automatically
            without you needing to send manual messages. This professional delivery experience
            builds trust and encourages repeat purchases, helping small sellers compete with
            larger established retailers.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Scaling From Small to Large Volumes
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            One of the biggest advantages of using a delivery platform is that it grows with you.
            When you start with a handful of daily orders, TOMUPRO handles them with the same
            system and tracking quality as when you scale to dozens or hundreds. There is no
            need to hire delivery staff, purchase vehicles, or manage route planning yourself.
            The platform handles driver assignment, route optimisation, and delivery confirmation
            so you can focus entirely on growing your store.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Our dashboard provides delivery analytics that help you understand patterns in your
            orders. See which districts have the highest demand, identify peak delivery hours,
            and track your delivery success rate over time. These insights help you make better
            decisions about inventory positioning, promotion timing, and delivery promises to
            your customers.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/same-day-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Same Day Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Express delivery for urgent orders</p>
            </Link>
            <Link to="/fulfillment-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Fulfillment Service</p>
              <p className="text-xs text-[#64748B] mt-1">Warehouse to doorstep for online sellers</p>
            </Link>
            <Link to="/courier-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Courier Service Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Fast and reliable parcel courier</p>
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
            Grow Your Online Store With Reliable Delivery
          </h2>
          <p className="text-gray-300 mb-8">
            Stop losing customers to delivery problems. Let TOMUPRO handle your eCommerce logistics.
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
