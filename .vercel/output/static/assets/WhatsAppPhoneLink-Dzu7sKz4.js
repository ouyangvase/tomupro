import{j as n,b2 as l,b3 as p,b4 as h}from"./index-ChVeSCJf.js";import{s as f,P as x}from"./phone-BHXt4Otb.js";const g="673";function c(e){return f(e)}function u(e){return c(e).length>0}function j(e){return!e||e.length===0?"Product × 1 unit":e.map(t=>{var a,i;const s=((a=t.product)==null?void 0:a.sku_code)||t.sku_label||"PRODUCT",o=((i=t.product)==null?void 0:i.sku_name)||"Unknown";return`${s}/${o} × ${t.qty} unit`}).join(`
`)}function C(e){const r=e.customer_name||"Customer",t=c(e.phone),s=e.address||"Address not provided",o=e.area||"Area not specified",a=j(e.order_items),i=Number(e.total_amount||0).toFixed(0);return`Hi ${r} 👋
This is Logistic Admin from Tomu.

📦 Delivery Info
Name: ${r}
Contact: +673${t}
Address: ${s}
Area: ${o}

Product: ${a}
Price: BND ${i}

✅ Delivery will be arranged according to runner route.
📞 Runner will contact you 1 hour before delivery.

💰 Please choose payment:

COD

Bank Transfer (please inform us for drop-off)

BIBD: 00-008-01-0051019
Baiduri: 0300117734291
Tomu Enterprise`}function d(e){const r=c(e.phone);if(!r)return null;const t=C(e),s=encodeURIComponent(t);return`https://api.whatsapp.com/send?phone=${g}${r}&text=${s}`}function m({className:e}){return n.jsx("svg",{viewBox:"0 0 24 24",fill:"currentColor",className:e,children:n.jsx("path",{d:"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"})})}function A({order:e,showIcon:r=!0,className:t=""}){const s=e.phone||"",o=d(e),a=u(s);return c(s),s?!a||!o?n.jsx("span",{className:`text-sm ${t}`,children:s}):n.jsxs("div",{className:`flex items-center gap-1.5 ${t}`,children:[n.jsxs(l,{children:[n.jsx(p,{asChild:!0,children:n.jsxs("a",{href:o,target:"_blank",rel:"noopener noreferrer",className:"flex items-center gap-1.5 text-primary hover:underline transition-colors",onClick:i=>i.stopPropagation(),children:[n.jsx(x,{className:"h-4 w-4 flex-shrink-0"}),n.jsx("span",{className:"text-sm",children:s})]})}),n.jsx(h,{children:n.jsx("p",{children:"Click to open WhatsApp chat"})})]}),r&&n.jsxs(l,{children:[n.jsx(p,{asChild:!0,children:n.jsx("a",{href:o,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors",onClick:i=>i.stopPropagation(),children:n.jsx(m,{className:"h-3.5 w-3.5"})})}),n.jsx(h,{children:n.jsx("p",{children:"Open WhatsApp"})})]})]}):n.jsx("span",{className:"text-muted-foreground",children:"-"})}function P({order:e,className:r=""}){const t=e.phone||"",s=d(e),o=u(t);return t?!o||!s?n.jsx("span",{className:`text-sm ${r}`,children:t}):n.jsxs("a",{href:s,target:"_blank",rel:"noopener noreferrer",className:`inline-flex items-center gap-1.5 text-primary hover:underline ${r}`,onClick:a=>a.stopPropagation(),children:[n.jsx(m,{className:"h-4 w-4 text-green-500 flex-shrink-0"}),n.jsx("span",{children:t})]}):n.jsx("span",{className:"text-muted-foreground",children:"-"})}export{A as W,P as a};
