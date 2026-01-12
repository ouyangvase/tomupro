import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, CheckCircle, Database, Loader2, RefreshCw, XCircle } from "lucide-react";

interface DiagnosticResults {
  ownersCount: number | null;
  packagesCount: number | null;
  accessCount: number | null;
  accessiblePackages: any[] | null;
  nullOwnerIdCount: number | null;
  errors: string[];
}

const ConnectionDiagnostic = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiagnosticResults | null>(null);

  // Get env variables (Vite uses VITE_ prefix)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  const maskKey = (key: string) => {
    if (!key || key.length < 12) return key || "(empty)";
    return `${key.slice(0, 6)}...${key.slice(-6)}`;
  };

  const runDiagnostics = async () => {
    setLoading(true);
    const errors: string[] = [];
    let ownersCount: number | null = null;
    let packagesCount: number | null = null;
    let accessCount: number | null = null;
    let accessiblePackages: any[] | null = null;
    let nullOwnerIdCount: number | null = null;

    try {
      // a) Count owners (pc_owners table)
      const { count: ownersCnt, error: ownersErr } = await supabase
        .from("pc_owners")
        .select("*", { count: "exact", head: true });
      
      if (ownersErr) {
        errors.push(`pc_owners query error: ${ownersErr.message}`);
      } else {
        ownersCount = ownersCnt;
      }

      // b) Count cn_packages
      const { count: pkgCnt, error: pkgErr } = await supabase
        .from("cn_packages")
        .select("*", { count: "exact", head: true });
      
      if (pkgErr) {
        errors.push(`cn_packages query error: ${pkgErr.message}`);
      } else {
        packagesCount = pkgCnt;
      }

      // c) Count owner_access for this email
      const { count: accessCnt, error: accessErr } = await supabase
        .from("owner_access")
        .select("*", { count: "exact", head: true })
        .ilike("user_email", email.toLowerCase());
      
      if (accessErr) {
        errors.push(`owner_access query error: ${accessErr.message}`);
      } else {
        accessCount = accessCnt;
      }

      // d) Get accessible packages with owner join
      const { data: pkgData, error: pkgDataErr } = await supabase
        .from("cn_packages")
        .select(`
          id,
          tracking_no,
          status,
          owner_id,
          pc_owners!cn_packages_owner_id_fkey(owner_name)
        `)
        .order("updated_at", { ascending: false })
        .limit(20);
      
      if (pkgDataErr) {
        errors.push(`Accessible packages query error: ${pkgDataErr.message}`);
      } else {
        accessiblePackages = pkgData?.map(p => ({
          id: p.id,
          tracking_no: p.tracking_no,
          status: p.status,
          owner_id: p.owner_id,
          owner_name: (p.pc_owners as any)?.owner_name || null
        })) || [];
      }

      // Check null owner_id count
      const { count: nullCnt, error: nullErr } = await supabase
        .from("cn_packages")
        .select("*", { count: "exact", head: true })
        .is("owner_id", null);
      
      if (nullErr) {
        errors.push(`Null owner_id check error: ${nullErr.message}`);
      } else {
        nullOwnerIdCount = nullCnt;
      }

    } catch (e: any) {
      errors.push(`Unexpected error: ${e.message}`);
    }

    setResults({
      ownersCount,
      packagesCount,
      accessCount,
      accessiblePackages,
      nullOwnerIdCount,
      errors
    });
    setLoading(false);
  };

  const getDiagnosis = () => {
    if (!results) return null;

    const { ownersCount, packagesCount, accessCount, accessiblePackages, nullOwnerIdCount } = results;

    // Case 1: Missing tables/data
    if (ownersCount === 0 || packagesCount === 0) {
      return {
        type: "error" as const,
        title: "Missing Data or Wrong Database",
        message: `pc_owners count: ${ownersCount}, cn_packages count: ${packagesCount}. This likely means you're connected to the wrong Supabase project, or the tables haven't been populated with data yet.`
      };
    }

    // Case 2: No owner access for this email
    if ((ownersCount ?? 0) > 0 && (packagesCount ?? 0) > 0 && accessCount === 0) {
      return {
        type: "warning" as const,
        title: "No Owner Access Grants",
        message: `This email (${email}) has no entries in owner_access table. The user cannot view any packages until an operator grants access.`
      };
    }

    // Case 3: Has access but no packages returned
    if ((accessCount ?? 0) > 0 && (accessiblePackages?.length ?? 0) === 0) {
      return {
        type: "warning" as const,
        title: "RLS/Policy Mismatch or Join Issue",
        message: `User has ${accessCount} owner access grant(s), but 0 packages are returned. Possible causes: RLS policy not evaluating correctly, or cn_packages.owner_id doesn't match pc_owners.owner_id. Null owner_id count: ${nullOwnerIdCount ?? 'unknown'}.`
      };
    }

    // Case 4: Everything looks good
    if ((accessiblePackages?.length ?? 0) > 0) {
      return {
        type: "success" as const,
        title: "Connection Verified",
        message: `Found ${accessiblePackages?.length} accessible packages for this user. The database connection and RLS policies appear to be working correctly.`
      };
    }

    return null;
  };

  const diagnosis = getDiagnosis();

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">PulseControl Connection Diagnostic</h1>
          <p className="text-muted-foreground">Verify database connection and debug package visibility</p>
        </div>
      </div>

      {/* Connection Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Supabase Connection</CardTitle>
          <CardDescription>Current environment configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground text-xs">VITE_SUPABASE_URL</Label>
              <div className="font-mono text-sm mt-1 break-all">
                {supabaseUrl || <span className="text-destructive">(empty - not configured!)</span>}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Anon Key Fingerprint</Label>
              <div className="font-mono text-sm mt-1">
                {maskKey(anonKey)}
              </div>
            </div>
          </div>
          
          {!supabaseUrl && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Supabase URL is empty. The app may not be connected to any database.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Test Query Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test Query</CardTitle>
          <CardDescription>Run diagnostic queries to check database state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="email">User Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runDiagnostics} disabled={loading || !email}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Run Test
              </Button>
            </div>
          </div>

          {results && (
            <>
              <Separator />
              
              {/* Query Results */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-secondary/30">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">pc_owners count</div>
                    <div className="text-2xl font-bold">{results.ownersCount ?? "Error"}</div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">cn_packages count</div>
                    <div className="text-2xl font-bold">{results.packagesCount ?? "Error"}</div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">owner_access (this email)</div>
                    <div className="text-2xl font-bold">{results.accessCount ?? "Error"}</div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">Accessible packages</div>
                    <div className="text-2xl font-bold">{results.accessiblePackages?.length ?? "Error"}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Errors */}
              {results.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Query Errors</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      {results.errors.map((err, i) => (
                        <li key={i} className="text-sm">{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Diagnosis */}
              {diagnosis && (
                <Alert variant={diagnosis.type === "error" ? "destructive" : "default"} 
                       className={diagnosis.type === "success" ? "border-green-500 bg-green-500/10" : 
                                  diagnosis.type === "warning" ? "border-yellow-500 bg-yellow-500/10" : ""}>
                  {diagnosis.type === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : diagnosis.type === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>{diagnosis.title}</AlertTitle>
                  <AlertDescription>{diagnosis.message}</AlertDescription>
                </Alert>
              )}

              {/* Sample Accessible Packages */}
              {results.accessiblePackages && results.accessiblePackages.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Sample Accessible Packages (first 5)</h3>
                  <div className="space-y-2">
                    {results.accessiblePackages.slice(0, 5).map((pkg) => (
                      <Card key={pkg.id} className="bg-secondary/20">
                        <CardContent className="p-3">
                          <div className="flex flex-wrap gap-2 items-center text-sm">
                            <Badge variant="outline">{pkg.tracking_no}</Badge>
                            <Badge>{pkg.status}</Badge>
                            <span className="text-muted-foreground">
                              Owner: {pkg.owner_name || <span className="text-destructive">NULL (owner_id: {pkg.owner_id || 'null'})</span>}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Null owner_id info */}
              {results.nullOwnerIdCount !== null && results.nullOwnerIdCount > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Null Owner IDs Detected</AlertTitle>
                  <AlertDescription>
                    {results.nullOwnerIdCount} packages have NULL owner_id. These packages won't be visible to any user through owner_access grants.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionDiagnostic;
