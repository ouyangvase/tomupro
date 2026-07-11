import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LogisticsServiceBrunei() {
  useEffect(() => {
    document.title = "Logistics Service Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Logistics Service in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Manage your entire supply chain with a platform built for Brunei. From fleet
            coordination to delivery completion, TOMUPRO keeps goods moving efficiently.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            End-to-End Logistics Operations
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Logistics is the backbone of every product-based business. Whether you are a
            retailer restocking shelves, an eCommerce brand shipping direct to consumers, or a
            distributor moving goods between locations, your logistics operation determines how
            fast, reliable, and cost-effective your business can be. In Brunei, where the market
            is growing and customer expectations are rising, having a dependable logistics
            partner makes the difference between keeping up and falling behind.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. We provide
            businesses with a complete set of tools to coordinate pickups, manage deliveries
            across multiple zones, track fleet activity in real time, and measure performance
            across every route. Our platform replaces the patchwork of phone calls, WhatsApp
            groups, and paper manifests that many Brunei businesses still rely on.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Fleet Management and Supply Chain Visibility
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Knowing where your vehicles are and what they are carrying should not require a
            phone call to each driver. TOMUPRO provides a live overview of your entire fleet,
            showing current positions, assigned tasks, and delivery progress. Managers can see
            at a glance which vehicles are available, which are en route, and which are
            returning. This visibility allows faster decisions when priorities shift or urgent
            orders come in.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For businesses that manage distribution across Brunei-Muara, Tutong, Belait, and
            Temburong, our zone-based routing ensures efficient coverage without wasted trips.
            The system groups deliveries by area, assigns them to drivers who are already nearby,
            and sequences stops to minimise driving time. Over weeks and months, these
            efficiencies add up to meaningful savings in fuel, vehicle wear, and labour costs.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Reliable Operations at Any Scale
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            A logistics service should grow with your business, not hold it back. TOMUPRO
            handles daily operations smoothly whether you are dispatching ten orders or managing
            hundreds. During peak periods like festive seasons or promotional campaigns, our
            automated dispatch distributes workload evenly across your available fleet.
            There is no need to hire temporary coordinators or extend operating hours for
            manual planning.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Performance reporting gives you clear data on delivery success rates, average
            transit times, and cost per delivery by zone. Use these insights to negotiate better
            rates, plan capacity, and set service-level promises you can actually keep. TOMUPRO
            is built for business owners who want to run logistics professionally without
            building an entire technology team from scratch.
          </p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-4">Related Services</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/last-mile-delivery-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Last Mile Delivery</p>
              <p className="text-xs text-[#64748B] mt-1">Fast, tracked delivery across Brunei</p>
            </Link>
            <Link to="/fulfillment-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Fulfillment Service</p>
              <p className="text-xs text-[#64748B] mt-1">Warehouse to doorstep for online sellers</p>
            </Link>
            <Link to="/logistics-company-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Company in Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Full logistics solutions for businesses</p>
            </Link>
            <Link to="/delivery-management-system" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery Management System</p>
              <p className="text-xs text-[#64748B] mt-1">Automate dispatch and track every order</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-[#0F172A] text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Upgrade Your Logistics Operations
          </h2>
          <p className="text-gray-300 mb-8">
            Get started with TOMUPRO and experience smarter, faster delivery management.
          </p>
          <Link to="/auth">
            <Button className="bg-[#B8860B] hover:bg-[#9A7209] text-white px-8 py-3 text-lg">
              Get Started <ArrowRight className="ml-2 h-5 w-5" />
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
