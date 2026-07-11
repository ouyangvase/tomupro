import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeliveryManagementSystem() {
  useEffect(() => {
    document.title = "Delivery Management System | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Delivery Management System for Businesses
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Stop managing deliveries with phone calls and spreadsheets. TOMUPRO gives you a
            single platform to dispatch, track, and analyse every delivery your business makes.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Automated Dispatch That Saves Hours
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Most delivery operations still rely on someone manually deciding which driver takes
            which order. That person checks availability, estimates distances, and hopes they
            made the right call. It works when you have five deliveries a day. At fifty or five
            hundred, it becomes a bottleneck that slows everything down and introduces errors.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            TOMUPRO is a logistics and delivery management platform in Brunei that automates the
            dispatch process entirely. When an order enters the system, it is immediately
            geocoded, matched to the best available driver based on location and capacity, and
            sent as a task notification. The driver accepts on their mobile app, and the delivery
            is underway. No phone calls, no waiting, no second-guessing. Operations managers
            oversee the process from a live dashboard rather than coordinating it manually.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Live Tracking and Customer Notifications
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Once a delivery is dispatched, both you and your customer should know exactly where
            it is. Our tracking system shows driver positions on a live map, provides estimated
            arrival times that update dynamically, and sends automated notifications at key
            milestones. Customers receive a link to track their delivery without needing to
            download an app or create an account.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            For business operators, the tracking dashboard highlights deliveries that are on
            schedule, those running late, and any that require attention. Automated alerts flag
            issues like failed delivery attempts or drivers deviating from their route. This
            level of visibility means problems are caught and resolved quickly rather than
            discovered hours later through customer complaints.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Analytics That Drive Better Decisions
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            A delivery management system should not just execute tasks. It should help you
            understand your operation and improve it. TOMUPRO records every delivery and
            generates reports on metrics that matter: on-time rate, average delivery duration,
            cost per delivery, driver productivity, and zone-level performance. These insights
            show you where to invest, where to cut, and how to set realistic service
            commitments.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Our platform serves eCommerce businesses, food delivery operators, courier
            companies, corporate logistics teams, and any organisation that moves goods from one
            point to another. Whether you have three drivers or thirty, TOMUPRO scales with your
            operation without requiring proportional increases in staff or management effort.
            The system handles routing, proof of delivery with photo and signature capture, and
            integrates with existing order management tools through our API.
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
            Take Control of Your Deliveries
          </h2>
          <p className="text-gray-300 mb-8">
            See how TOMUPRO can streamline your delivery operations with automation and full
            visibility.
          </p>
          <Link to="/auth">
            <Button className="bg-[#B8860B] hover:bg-[#9A7209] text-white px-8 py-3 text-lg">
              Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
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
