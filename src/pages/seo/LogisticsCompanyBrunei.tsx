import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LogisticsCompanyBrunei() {
  useEffect(() => {
    document.title = "Logistics Company in Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Logistics Company in Brunei for Businesses
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Modern logistics powered by intelligent technology. TOMUPRO helps Brunei businesses
            move goods faster, reduce costs, and deliver a better experience to their customers.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Why Brunei Businesses Need Modern Logistics
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            The way Brunei shops and does business has changed. Online orders are growing,
            customers expect same-day or next-day delivery, and businesses compete not just on
            product quality but on how quickly and reliably they can get goods to buyers. Yet
            many companies still coordinate deliveries through WhatsApp messages, handwritten
            manifests, and drivers who operate with limited guidance. The gap between customer
            expectations and operational capability creates lost sales and frustrated buyers.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei. We exist to
            close that gap by giving businesses of all sizes access to the same logistics
            technology that large corporations use. Our platform handles route planning, driver
            dispatch, real-time tracking, proof of delivery, and performance reporting through
            a single dashboard. You do not need a logistics department to run professional
            delivery operations.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            AI-Powered Advantage
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Traditional logistics relies on experienced coordinators making judgement calls
            about which driver should take which delivery. That approach works at small scale
            but breaks down as volume increases. TOMUPRO uses intelligent algorithms to make
            these decisions instantly and consistently. Every order is analysed for location,
            urgency, and delivery requirements, then matched to the optimal driver and route
            within seconds.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            The system continuously learns from completed deliveries. Routes that consistently
            take longer than expected are flagged. Drivers who perform well in specific zones
            are prioritised for those areas. Delivery windows are predicted with increasing
            accuracy over time. This is not automation for its own sake. It is practical
            intelligence that reduces costs, improves punctuality, and frees your team to focus
            on serving customers rather than chasing parcels.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            A Logistics Partner for Every Type of Business
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            TOMUPRO serves eCommerce sellers who need fast and affordable shipping, food
            businesses that require time-sensitive delivery, retail chains restocking multiple
            outlets, and service companies dispatching technicians or supplies. Our platform is
            flexible enough to handle different delivery types, vehicle sizes, and scheduling
            requirements within the same system.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Brunei is a compact country, which means efficient logistics should be achievable
            for everyone. With coverage across Brunei-Muara, Tutong, Belait, and Temburong, we
            ensure that businesses can reach customers in every district with consistent speed
            and reliability. Whether you dispatch five deliveries a day or five hundred, TOMUPRO
            provides the structure, visibility, and automation to run your logistics operation
            professionally and profitably.
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
            <Link to="/delivery-management-system" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Delivery Management System</p>
              <p className="text-xs text-[#64748B] mt-1">Automate dispatch and track every order</p>
            </Link>
            <Link to="/logistics-service-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Service Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">End-to-end supply chain operations</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-[#0F172A] text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to Move Goods Smarter?
          </h2>
          <p className="text-gray-300 mb-8">
            Join Brunei businesses using TOMUPRO to run faster, more reliable logistics operations.
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
