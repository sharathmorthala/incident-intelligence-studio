import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-[100dvh]">
        <header className="h-14 bg-background border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-sm hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search incidents, correlation IDs, services..."
                className="pl-9 h-9 bg-muted/50 border-none w-full focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <Select defaultValue="prod">
                <SelectTrigger className="h-8 w-[120px] bg-muted/50 border-none text-xs">
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="qa">QA/Staging</SelectItem>
                  <SelectItem value="dev">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
