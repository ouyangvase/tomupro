import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LastMileDeliveryBrunei() {
  useEffect(() => {
    document.title = "Last Mile Delivery Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Last Mile Delivery Service in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Get your products into customers' hands quickly and reliably. TOMUPRO handles Brunei last mile delivery with real-time tracking, intelligent routing, and full COD support.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            The Last Mile Challenge in Brunei
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            For online sellers and retailers in Brunei, the final delivery step often determines
            whether a customer returns or moves on to a competitor. A late parcel, a missed
            delivery attempt, or a package left without notification can undo weeks of marketing
            effort. In a market where word-of-mouth matters deeply, every delivery experience
            counts.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. We built our
            last mile service around the specific needs of local businesses, whether you are
            shipping fashion items from an Instagram store, delivering meal kits on a schedule,
            or sending documents between offices. Our system matches each order to the nearest
            available driver, calculates the fastest route, and notifies customers with accurate
            arrival windows.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Coverage Across All Districts
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Our delivery network covers Bandar Seri Begawan, Tutong, Seria, Kuala Belait, and
            Temburong. Unlike services that focus only on the capital area, we ensure consistent
            delivery quality regardless of where your customer is located. Businesses in Seria
            can serve buyers in the capital just as easily as local ones. Sellers based in
            Bandar can confidently offer delivery to Temburong without worrying about delays or
            inflated costs.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Each delivery is tracked from pickup to completion. Customers receive automated
            updates via SMS or WhatsApp, including estimated time of arrival and proof of
            delivery. For eCommerce sellers, this transparency reduces "where is my order"
            enquiries and builds the kind of trust that drives repeat purchases. Our routing
            engine accounts for bridge crossings, district boundaries, and local traffic
            patterns to keep deliveries on schedule.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Built for eCommerce Sellers and Local Businesses
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            If you sell on Shopee, Instagram, or your own website, you know that delivery speed
            is a competitive advantage. TOMUPRO supports same-day and next-day delivery options
            so your customers do not have to wait. Orders placed in the morning can arrive by
            evening. Subscription-based businesses can schedule recurring deliveries that run
            automatically without daily manual input.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Our dashboard gives you a clear view of all pending, in-progress, and completed
            deliveries. You can track driver locations in real time, review delivery success
            rates, and identify areas where service can be improved. Cash on delivery orders are tracked and reconciled automatically, so you always know exactly how much was collected. Instead of juggling phone
            calls and spreadsheets, you manage your entire delivery operation from one place.
            That means less time on logistics and more time growing your business.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/logistics-company-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Company in Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Full logistics solutions for businesses</p>
            </Link>
            <Link to="/fulfillment-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Fulfillment Service</p>
              <p className="text-xs text-[#64748B] mt-1">Warehouse to doorstep for online sellers</p>
            </Link>
            <Link to="/delivery-management-system" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery Management System</p>
              <p className="text-xs text-[#64748B] mt-1">Automate dispatch and track every order</p>
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
            Start Delivering Smarter Today
          </h2>
          <p className="text-gray-300 mb-8">
            Join businesses across Brunei that rely on TOMUPRO for fast, tracked last mile delivery.
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
