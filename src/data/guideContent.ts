import capybaraAdmin from '@/assets/capybara-admin.png';
import capybaraManager from '@/assets/capybara-manager.png';
import capybaraSales from '@/assets/capybara-sales.png';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraDriver from '@/assets/capybara-driver.png';

export type GuideRole = 'admin' | 'manager' | 'salesperson' | 'runner' | 'driver';
export type GuideType = 'overview' | 'getting-started' | 'core-task' | 'page-guide' | 'example' | 'faq';

export interface GuideStep {
  title: string;
  description: string;
  targetPage?: string;
  actionLabel?: string;
  actionType?: 'navigate' | 'highlight' | 'info';
}

export interface Guide {
  id: string;
  role: GuideRole;
  type: GuideType;
  title: string;
  summary: string;
  icon: string;
  steps: GuideStep[];
  tags: string[];
}

export interface OnboardingStep {
  title: string;
  description: string;
  image?: string;
  actions?: string[];
}

export interface RoleOnboarding {
  role: GuideRole;
  welcome: string;
  subtitle: string;
  image: string;
  whatYouDo: string;
  firstActions: string[];
  steps: OnboardingStep[];
}

export const roleImages: Record<GuideRole, string> = {
  admin: capybaraAdmin,
  manager: capybaraManager,
  salesperson: capybaraSales,
  runner: capybaraRunner,
  driver: capybaraDriver,
};

export const roleDescriptions: Record<GuideRole, string> = {
  admin: 'Full system oversight — manage users, stock integrity, events, and all operations.',
  manager: 'Team leadership — oversee salesperson performance, approve transfers, and drive impact.',
  salesperson: 'Order management — create orders, track deliveries, and grow your commission.',
  runner: 'Logistics coordination — manage dispatch, inbound, claims, and driver operations.',
  driver: 'Last-mile delivery — pick up, deliver, and report on orders assigned to you.',
};

// ── Onboarding flows per role ──
export const onboardingFlows: RoleOnboarding[] = [
  {
    role: 'admin',
    welcome: 'Welcome to TOMUPRO Command Center',
    subtitle: 'You have full control of the entire operations platform.',
    image: capybaraAdmin,
    whatYouDo: 'As Admin, you oversee all operations, manage users, monitor stock integrity, create events, and ensure the system runs smoothly.',
    firstActions: [
      'Check the Operations Center for system-wide alerts',
      'Review Stock Integrity for any balance issues',
      'Manage team members in User Settings',
    ],
    steps: [
      { title: 'Dashboard', description: 'Your command center shows operations pipeline, action alerts, and live activity across all roles.', actions: ['View pipeline metrics', 'Check action required'] },
      { title: 'Operations', description: 'Monitor booking, ready, delivered, and cancelled orders across all salespersons.', actions: ['View all orders', 'Handle disputes'] },
      { title: 'Stock Integrity', description: 'Open Stock Balance to inspect source records and run the unified integrity preview before any repair.', actions: ['Preview check', 'Review source records'] },
      { title: 'Events & Announcements', description: 'Create targeted popups and announcements for specific roles, users, or teams.', actions: ['Create event', 'Track responses'] },
    ],
  },
  {
    role: 'manager',
    welcome: 'Welcome, Team Leader!',
    subtitle: 'Lead your team to success with real-time insights.',
    image: capybaraManager,
    whatYouDo: 'As Manager, you oversee your salesperson team, approve stock transfers, track rankings, and ensure targets are met.',
    firstActions: [
      'Check Team Oversight for your team performance',
      'Review Pending Approvals for stock transfers',
      'Visit the Impact Board to see your contribution',
    ],
    steps: [
      { title: 'Team Oversight', description: 'See all your team members, their order counts, and performance metrics in one view.', actions: ['View team stats', 'Filter by member'] },
      { title: 'Pending Approvals', description: 'Approve or reject stock transfers directed to your warehouse.', actions: ['Review transfers', 'Approve/Reject'] },
      { title: 'Ranking Board', description: 'Track how your team ranks against others in deliveries, revenue, and efficiency.', actions: ['View rankings', 'Compare periods'] },
    ],
  },
  {
    role: 'salesperson',
    welcome: 'Welcome to Your Sales Hub!',
    subtitle: 'Create orders, track deliveries, and grow your commission.',
    image: capybaraSales,
    whatYouDo: 'As Salesperson, you create customer orders, manage bookings through the ready stage, handle failed deliveries, and track your earnings.',
    firstActions: [
      'Create your first order in Booking Sales',
      'Check Action Required for orders needing attention',
      'View your commission on the Leaderboard',
    ],
    steps: [
      { title: 'Booking Sales', description: 'Create new orders with customer details, products, and delivery info. Orders start in BOOKING status.', actions: ['Create order', 'Import CSV'] },
      { title: 'Ready Orders', description: 'Once stock is confirmed, orders move to READY. Runners will pick them up for delivery.', actions: ['View ready orders', 'Track status'] },
      { title: 'Action Required', description: 'Failed deliveries and runner notes appear here. Resolve them quickly to maintain performance.', actions: ['Handle failed', 'Reschedule'] },
      { title: 'Leaderboard', description: 'See your ranking among peers. Earn badges for monthly and quarterly performance.', actions: ['Check rank', 'View stats'] },
    ],
  },
  {
    role: 'runner',
    welcome: 'Welcome to Logistics HQ!',
    subtitle: 'Coordinate dispatch, manage drivers, and process claims.',
    image: capybaraRunner,
    whatYouDo: 'As Runner, you receive ready orders, assign drivers, manage pickups and returns, process claim batches, and handle delivery charges.',
    firstActions: [
      'Check Runner Inbox for new orders to dispatch',
      'Manage your drivers in Driver Management',
      'Process claim batches for completed deliveries',
    ],
    steps: [
      { title: 'Runner Inbox', description: 'View all orders assigned to you. Assign drivers, manage status, and track deliveries.', actions: ['View orders', 'Assign drivers'] },
      { title: 'Inbound', description: 'Receive stock from salespersons. Verify quantities and confirm receipt.', actions: ['Confirm inbound', 'Report issues'] },
      { title: 'Claim Batches', description: 'Submit delivered orders for payment claims. Group orders into batches for efficient processing.', actions: ['Create batch', 'Submit claim'] },
      { title: 'Delivery Charges', description: 'Propose and manage delivery charges by area. Charges are approved by admin.', actions: ['View charges', 'Propose new'] },
    ],
  },
  {
    role: 'driver',
    welcome: 'Welcome, Road Warrior!',
    subtitle: 'Pick up, deliver, and report — all from your phone.',
    image: capybaraDriver,
    whatYouDo: 'As Driver, you receive assigned deliveries, navigate to customers, confirm deliveries or report failures, and manage pickups and returns.',
    firstActions: [
      'Check My Deliveries for assigned orders',
      'Use Optimized Route for efficient navigation',
      'Report delivery status for each order',
    ],
    steps: [
      { title: 'My Deliveries', description: 'See all orders assigned to you. Tap an order to view details, navigate, or update status.', actions: ['View orders', 'Update status'] },
      { title: 'Optimized Route', description: 'Get the best route to deliver all your orders efficiently. Uses real-time mapping.', actions: ['Start route', 'Reorder stops'] },
      { title: 'Pickups & Returns', description: 'Pick up stock from warehouse and return unsold items. Track everything accurately.', actions: ['View pickups', 'Submit returns'] },
    ],
  },
];

// ── Guide content ──
export const guides: Guide[] = [
  // Admin guides
  { id: 'admin-dashboard', role: 'admin', type: 'page-guide', title: 'Dashboard Overview', summary: 'Understand the admin command center and operations pipeline.', icon: '📊', tags: ['dashboard', 'operations', 'pipeline', 'metrics'], steps: [
    { title: 'Operations Pipeline', description: 'The top cards show Booking → Ready → Dispatch → Delivered flow. Click any card to drill into that stage.' },
    { title: 'Action Required', description: 'Red alerts show system-wide issues requiring immediate attention — failed deliveries, reschedules, and runner notes.' },
    { title: 'Live Activity', description: 'Real-time feed of system actions. Useful for monitoring operations during peak hours.' },
  ]},
  { id: 'admin-action-required', role: 'admin', type: 'core-task', title: 'Handling Action Required', summary: 'Process failed deliveries, reschedule requests, and runner notes.', icon: '🚨', tags: ['action required', 'failed', 'reschedule', 'alerts'], steps: [
    { title: 'Navigate to Action Required', description: 'Go to Operations → Action Required. This shows all orders needing attention across all salespersons.', targetPage: '/sales/action-required' },
    { title: 'Review each issue', description: 'Each order shows the failure reason, runner notes, and suggested next action.' },
    { title: 'Take action', description: 'You can reschedule, cancel, or reassign orders. Bulk actions are available for multiple selections.' },
  ]},
  { id: 'admin-stock-integrity', role: 'admin', type: 'page-guide', title: 'Stock Integrity Audit', summary: 'Audit and repair stock balances across all warehouses.', icon: '🔧', tags: ['stock', 'integrity', 'audit', 'repair', 'balance'], steps: [
    { title: 'Preview Check', description: 'Run Preview Check to see affected order lines, orders, and total item quantity without changing stock.' },
    { title: 'Review a SKU', description: 'Click a Stock Balance row to compare inbound, delivered, transfer, and adjustment source records.' },
    { title: 'Verified Repair', description: 'Only administrators can confirm a repair after preview. Recognized historical deductions are skipped.' },
  ]},
  { id: 'admin-events', role: 'admin', type: 'core-task', title: 'Events & Announcements', summary: 'Create targeted popups and announcements for users.', icon: '📣', tags: ['events', 'announcements', 'popup', 'targeting'], steps: [
    { title: 'Create Event', description: 'Go to Events Admin → Create. Choose Event or Announcement type.', targetPage: '/admin/events/create' },
    { title: 'Target Audience', description: 'Select who sees it — all users, specific roles, individual users, or teams.' },
    { title: 'Track Responses', description: 'View analytics: who viewed, who joined, who dismissed.' },
  ]},
  { id: 'admin-users', role: 'admin', type: 'page-guide', title: 'User Management', summary: 'Add, edit, disable users and manage role assignments.', icon: '👥', tags: ['users', 'roles', 'settings', 'manage'], steps: [
    { title: 'View all users', description: 'Go to System → Users. See all registered accounts with their roles and status.', targetPage: '/settings/users' },
    { title: 'Change roles', description: 'Click a user to edit. Change their role to promote or reassign them.' },
    { title: 'Disable accounts', description: 'Disable users who leave. Their data is preserved but they cannot log in.' },
  ]},

  // Manager guides
  { id: 'manager-oversight', role: 'manager', type: 'page-guide', title: 'Team Oversight', summary: 'Monitor your team performance and order status.', icon: '👁️', tags: ['team', 'oversight', 'performance', 'monitor'], steps: [
    { title: 'Team Overview', description: 'See all salespersons bound to you with their booking, ready, and overdue counts.', targetPage: '/manager/oversight' },
    { title: 'Drill into members', description: 'Click any team member to see their orders and take action if needed.' },
  ]},
  { id: 'manager-ranking', role: 'manager', type: 'page-guide', title: 'Manager Ranking', summary: 'Track your team ranking and performance metrics.', icon: '🏆', tags: ['ranking', 'performance', 'leaderboard'], steps: [
    { title: 'View Rankings', description: 'The ranking board shows all managers sorted by team delivery performance.', targetPage: '/manager/ranking-board' },
    { title: 'Compare periods', description: 'Switch between daily, weekly, and monthly views to track trends.' },
  ]},
  { id: 'manager-approvals', role: 'manager', type: 'core-task', title: 'Pending Approvals', summary: 'Approve or reject stock transfers directed to your team.', icon: '✅', tags: ['approvals', 'stock', 'transfer', 'pending'], steps: [
    { title: 'Check pending', description: 'Go to Pending Approvals. Review each transfer request with quantities and source.', targetPage: '/manager/pending-approvals' },
    { title: 'Approve or Reject', description: 'Click Approve to accept stock, or Reject with a reason.' },
  ]},
  { id: 'manager-impact', role: 'manager', type: 'page-guide', title: 'Impact Board', summary: 'Visualize your contribution to the organization.', icon: '📈', tags: ['impact', 'contribution', 'metrics'], steps: [
    { title: 'View Impact', description: 'The Impact Board shows your team delivery value, growth rate, and contribution percentage.', targetPage: '/manager/impact-board' },
  ]},

  // Salesperson guides
  { id: 'sales-create-order', role: 'salesperson', type: 'example', title: 'Create & Follow an Order', summary: 'Step-by-step: from creating an order to delivery.', icon: '📦', tags: ['order', 'create', 'booking', 'follow', 'status'], steps: [
    { title: 'Go to Booking Sales', description: 'Navigate to Operations → Booking Sales and click + New Order.', targetPage: '/sales/booking' },
    { title: 'Fill order details', description: 'Enter customer name, phone, address, area, and select products with quantities.' },
    { title: 'Submit order', description: 'Click Create Order. The order appears in BOOKING status.' },
    { title: 'Track to Ready', description: 'Once stock is confirmed, the order moves to READY status automatically.' },
    { title: 'Monitor delivery', description: 'After a runner picks it up, track runner_status: ASSIGNED → TAKEN → DELIVERED.' },
  ]},
  { id: 'sales-failed-delivery', role: 'salesperson', type: 'core-task', title: 'Handle Failed Delivery', summary: 'What to do when delivery fails.', icon: '❌', tags: ['failed', 'delivery', 'action', 'reschedule'], steps: [
    { title: 'Check Action Required', description: 'Go to Action Required page. Failed deliveries appear with the runner failure reason.', targetPage: '/sales/action-required' },
    { title: 'Contact customer', description: 'Call or WhatsApp the customer to understand the issue.' },
    { title: 'Reschedule or cancel', description: 'Set a new delivery date to reschedule, or cancel with a reason if the customer no longer wants it.' },
  ]},
  { id: 'sales-commission', role: 'salesperson', type: 'page-guide', title: 'Commission & Ranking', summary: 'Track your earnings and leaderboard position.', icon: '💰', tags: ['commission', 'ranking', 'leaderboard', 'earnings'], steps: [
    { title: 'View Leaderboard', description: 'Go to Performance → Leaderboard to see your rank and delivered counts.', targetPage: '/leaderboard' },
    { title: 'Understand commission', description: 'Commission is calculated per delivered order. Rates may be flat or tiered based on admin settings.' },
  ]},
  { id: 'sales-order-status', role: 'salesperson', type: 'getting-started', title: 'Understanding Order Status', summary: 'Learn what each order status means.', icon: '🔄', tags: ['status', 'booking', 'ready', 'delivered', 'cancelled'], steps: [
    { title: 'BOOKING', description: 'Order is created. Awaiting stock confirmation or pickup date.' },
    { title: 'READY', description: 'Stock confirmed. Waiting for runner to pick up and assign to a driver.' },
    { title: 'Runner Status', description: 'UNASSIGNED → ASSIGNED → TAKEN → DELIVERED or FAILED_DELIVERY.' },
    { title: 'CANCELLED', description: 'Order cancelled. A cancel reason is always required.' },
  ]},

  // Runner guides
  { id: 'runner-inbox', role: 'runner', type: 'page-guide', title: 'Runner Inbox', summary: 'Manage assigned orders, dispatch to drivers.', icon: '📥', tags: ['inbox', 'orders', 'dispatch', 'assign'], steps: [
    { title: 'View assigned orders', description: 'Runner Inbox shows all READY orders assigned to you. Use filters to sort by area, status, or date.', targetPage: '/runner/inbox' },
    { title: 'Assign to driver', description: 'Select orders and click Assign to pick a driver for delivery.' },
    { title: 'Track delivery', description: 'Monitor status changes as drivers update — TAKEN, DELIVERED, or FAILED.' },
  ]},
  { id: 'runner-claim-batch', role: 'runner', type: 'example', title: 'Submit a Claim Batch', summary: 'How to submit delivered orders for payment.', icon: '💵', tags: ['claim', 'batch', 'payment', 'submit', 'reconciliation'], steps: [
    { title: 'Go to Claim Batches', description: 'Navigate to Finance → My Claim Batches.', targetPage: '/runner/claims' },
    { title: 'Select delivered orders', description: 'Choose DELIVERED orders that havent been claimed yet.' },
    { title: 'Submit batch', description: 'Create a batch with selected orders. Admin will review and acknowledge.' },
  ]},
  { id: 'runner-inbound', role: 'runner', type: 'core-task', title: 'Runner Inbound', summary: 'Receive stock from salespersons into your warehouse.', icon: '📦', tags: ['inbound', 'stock', 'receive', 'warehouse'], steps: [
    { title: 'Navigate to Inbound', description: 'Go to Logistics → Runner Inbound.', targetPage: '/runner/inbound' },
    { title: 'Confirm quantities', description: 'Verify the items and quantities match what the salesperson sent.' },
    { title: 'Accept inbound', description: 'Confirm receipt. Stock movements are automatically recorded.' },
  ]},
  { id: 'runner-delivery-charges', role: 'runner', type: 'page-guide', title: 'Delivery Charges', summary: 'Propose and manage delivery fees by area.', icon: '💲', tags: ['delivery', 'charges', 'fees', 'area'], steps: [
    { title: 'View charges', description: 'Go to Finance → Delivery Charges to see current rates by area.', targetPage: '/runner/delivery-charges' },
    { title: 'Propose new rate', description: 'Click Propose to suggest a new delivery charge for an area. Admin must approve.' },
  ]},

  // Driver guides
  { id: 'driver-deliveries', role: 'driver', type: 'page-guide', title: 'My Deliveries', summary: 'View and update your assigned delivery orders.', icon: '🚚', tags: ['deliveries', 'orders', 'assigned', 'status'], steps: [
    { title: 'View orders', description: 'My Deliveries shows all orders assigned to you by your runner.', targetPage: '/driver/inbox' },
    { title: 'Update status', description: 'After delivering, mark as DELIVERED with proof. If failed, select a failure reason.' },
    { title: 'Payment collection', description: 'For COD orders, collect payment and record the amount.' },
  ]},
  { id: 'driver-route', role: 'driver', type: 'page-guide', title: 'Route & Map', summary: 'Use the optimized route for efficient deliveries.', icon: '🗺️', tags: ['route', 'map', 'navigation', 'optimize'], steps: [
    { title: 'Open Route', description: 'Go to Delivery → Optimized Route. The system calculates the best delivery sequence.', targetPage: '/driver/route' },
    { title: 'Navigate', description: 'Tap any stop to open Google Maps navigation. Drag to reorder if needed.' },
  ]},
  { id: 'driver-failed', role: 'driver', type: 'core-task', title: 'Failed Delivery Handling', summary: 'What to do when you cannot deliver an order.', icon: '⚠️', tags: ['failed', 'delivery', 'reason', 'report'], steps: [
    { title: 'Select failure reason', description: 'When a delivery fails, choose from predefined reasons: not home, wrong address, refused, etc.' },
    { title: 'Add notes', description: 'Provide details to help the salesperson resolve the issue.' },
    { title: 'Submit', description: 'The order moves to FAILED_DELIVERY and the salesperson is notified.' },
  ]},
  { id: 'driver-pickups-returns', role: 'driver', type: 'page-guide', title: 'Pickups & Returns', summary: 'Manage stock pickups and return unsold items.', icon: '📋', tags: ['pickups', 'returns', 'stock', 'warehouse'], steps: [
    { title: 'View Pickups', description: 'Check My Pickups for scheduled stock pickups from your runner.', targetPage: '/driver/pickups' },
    { title: 'Return unsold', description: 'Submit returns for items you could not deliver. Your runner will acknowledge.' },
  ]},
];

// ── FAQ ──
export const faqItems: { question: string; answer: string; roles: GuideRole[] }[] = [
  { question: 'How do I change my password?', answer: 'Go to Profile settings and use the Change Password section.', roles: ['admin', 'manager', 'salesperson', 'runner', 'driver'] },
  { question: 'What happens when an order is cancelled?', answer: 'Cancelled orders return stock to inventory and record a cancel reason. They appear on the Cancelled Sales page.', roles: ['admin', 'salesperson', 'manager'] },
  { question: 'How do I check my commission?', answer: 'Visit the Leaderboard page. Your commission is calculated based on delivered orders and admin-configured rates.', roles: ['salesperson'] },
  { question: 'What if my stock balance is negative?', answer: 'Open Stock Balance and click the SKU to inspect its source records. Run Preview Check before considering a verified repair.', roles: ['admin'] },
  { question: 'How do I assign a driver?', answer: 'In Runner Inbox, select orders and click Assign. Choose from your registered drivers.', roles: ['runner'] },
  { question: 'How do I report a failed delivery?', answer: 'In My Deliveries, tap the order, select a failure reason, add notes, and submit.', roles: ['driver'] },
  { question: 'Can I see orders from other salespersons?', answer: 'Only if your manager or admin has enabled data sharing for those users via the Data Sharing settings.', roles: ['salesperson', 'manager'] },
];

// ── Page guides mapping ──
export const pageGuides: Record<string, { title: string; description: string; guideId?: string }> = {
  '/': { title: 'Dashboard', description: 'Your operational command center with key metrics and quick actions.' },
  '/sales/booking': { title: 'Booking Sales', description: 'Create and manage new customer orders. Orders start here before moving to Ready.' },
  '/sales/ready': { title: 'Ready Orders', description: 'Orders with confirmed stock ready for runner pickup and delivery.' },
  '/sales/action-required': { title: 'Action Required', description: 'Orders needing immediate attention — failed deliveries, reschedules, and runner notes.', guideId: 'admin-action-required' },
  '/runner/inbox': { title: 'Runner Inbox', description: 'All orders assigned to you for dispatch. Assign drivers and track delivery progress.', guideId: 'runner-inbox' },
  '/admin/stock-integrity': { title: 'Stock Rebuild', description: 'Audit and repair stock balances across all warehouses.', guideId: 'admin-stock-integrity' },
  '/admin/overview': { title: 'Operations Center', description: 'System-wide metrics, pipeline status, and salesperson accountability.' },
  '/leaderboard': { title: 'Leaderboard', description: 'Performance rankings with gold, silver, bronze positions and achievement badges.' },
  '/driver/inbox': { title: 'My Deliveries', description: 'Orders assigned to you for delivery. Update status after each delivery attempt.', guideId: 'driver-deliveries' },
  '/driver/route': { title: 'Optimized Route', description: 'AI-optimized delivery route. Tap stops to navigate with Google Maps.', guideId: 'driver-route' },
  '/inventory': { title: 'Stock Balance', description: 'Current inventory levels across all warehouses and products.' },
};
