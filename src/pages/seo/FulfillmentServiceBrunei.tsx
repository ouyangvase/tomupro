import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FulfillmentServiceBrunei() {
  useEffect(() => {
    document.title = "Fulfillment Service Brunei | TOMUPRO";
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero Section */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Fulfillment Service for eCommerce in Brunei
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            From the moment an order is placed to the second it arrives at your customer's door,
            TOMUPRO manages the entire Brunei fulfillment process — including COD collection — so you can focus on selling.
          </p>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            How Order Fulfillment Works
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Running an online store in Brunei is exciting until orders start piling up and
            packing takes over your living room. Many sellers begin by handling fulfillment
            themselves, but as sales grow, the process becomes unsustainable. Missed orders,
            wrong items shipped, and slow turnaround eat into profits and damage your reputation.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            A proper fulfillment service handles everything between the sale and the delivery.
            When a customer places an order, the system receives it instantly, assigns it to be
            picked from inventory, packs it according to your specifications, and dispatches it
            for delivery. TOMUPRO is a logistics and delivery management platform in Brunei that
            connects each step automatically. Orders flow from your sales channel straight into
            our system without manual data entry or copy-pasting tracking numbers.
          </p>
        </div>
      </section>

      {/* Content Section 2 */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Inventory Management and Warehouse Coordination
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Knowing what you have in stock sounds simple, but it trips up more online sellers
            than you might expect. Overselling a product that is out of stock leads to refunds
            and apologies. Holding too much inventory ties up capital. TOMUPRO provides clear
            stock-level visibility so you always know exactly what is available, what is running
            low, and what needs reordering.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Our system tracks inventory in real time as orders are fulfilled. When stock drops
            below a threshold you set, you receive an alert. For sellers with multiple product
            lines, batch processing features let you manage high volumes without losing accuracy.
            The picking and packing workflow is designed to minimise errors, with order
            verification steps built in so the right product always goes into the right package.
          </p>
        </div>
      </section>

      {/* Content Section 3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4">
            Why Online Sellers in Brunei Choose TOMUPRO
          </h2>
          <p className="text-[#64748B] leading-relaxed mb-4">
            Fulfillment speed directly impacts customer satisfaction and repeat purchases. Buyers
            in Brunei have come to expect fast delivery, and if your competitor ships same-day
            while you take three days, the choice is obvious. With TOMUPRO, orders placed before
            your cutoff time can be dispatched the same day. Our system assigns the nearest
            driver automatically and optimises routes so deliveries arrive within the promised
            window.
          </p>
          <p className="text-[#64748B] leading-relaxed">
            Whether you sell on Shopee, run a Shopify store, or take orders through WhatsApp and
            Instagram, our fulfillment service integrates with your workflow. Cash on delivery (COD) orders are handled seamlessly — drivers collect payment and the system reconciles every transaction automatically. You do not need to
            rebuild your business around new software. Instead, TOMUPRO slots into your existing
            process and handles the operational side while you concentrate on products, marketing,
            and customer relationships.
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
            <Link to="/logistics-company-brunei" className="p-4 bg-white rounded-lg border border-[#F1F5F9] hover:border-[#B8860B]/30 transition-colors">
              <p className="font-medium text-[#0F172A] text-sm">Logistics Company in Brunei</p>
              <p className="text-xs text-[#64748B] mt-1">Full logistics solutions for businesses</p>
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
            Simplify Your Fulfillment Today
          </h2>
          <p className="text-gray-300 mb-8">
            Connect your store and let TOMUPRO handle picking, packing, and shipping for you.
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
