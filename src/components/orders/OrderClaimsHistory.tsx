import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useClaims } from '@/hooks/useClaims';

interface OrderClaimsHistoryProps {
  orderId: string;
}

export function OrderClaimsHistory({ orderId }: OrderClaimsHistoryProps) {
  const { data: claims = [], isLoading } = useClaims({ orderId });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Loading claims...
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No claims for this order.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Proof</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell className="text-sm">
                {format(new Date(claim.created_at), 'MMM dd, yyyy HH:mm')}
              </TableCell>
              <TableCell className="font-medium">
                ${Number(claim.amount).toFixed(2)}
              </TableCell>
              <TableCell>
                {claim.method ? (
                  <Badge variant="outline">{claim.method}</Badge>
                ) : '-'}
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={claim.note || ''}>
                {claim.note || '-'}
              </TableCell>
              <TableCell>
                {claim.proof_url ? (
                  <a
                    href={claim.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                ) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="p-3 bg-muted/30 border-t text-sm text-muted-foreground">
        Total: <span className="font-medium text-foreground">
          ${claims.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
