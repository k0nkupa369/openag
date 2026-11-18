import { ProactiveSources, ProactiveHistory } from './ProactiveSources';
import { ProactiveDestination } from './ProactiveDestination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { hrefFor, type ProactiveTab } from "../route";
import type { Api } from "../api";
import { HeldBack } from "./HeldBack";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProactiveCard } from "./ProactiveCard";
import { ReflectionPanel } from "./ReflectionPanel";
import { SettingsHeader } from "./SettingsLayout";
import { SchedulePanel } from "./SchedulePanel";

export function ProactivePage({ api, tab = "schedule", canManage = false }: { api: Api; tab?: ProactiveTab; canManage?: boolean }) {
  return (
    <section data-slot="proactive-page" className="flex flex-col gap-5" aria-labelledby="proactive-title">
      <SettingsHeader id="proactive-title" title="Proactive" description="Choose what your agent checks, when it checks and what needs your attention." />
      <Tabs value={tab} onValueChange={value => { window.location.hash = hrefFor({kind: "settings", section: "proactive", tab: value as ProactiveTab}); }}><TabsList variant="line" aria-label="Proactive settings"><TabsTrigger value="schedule">Schedule</TabsTrigger><TabsTrigger value="reflection">Reflection</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
      <TabsContent value="schedule" keepMounted><div className="flex flex-col gap-5"><ProactiveSources api={api} canManage={canManage} /><ProactiveDestination api={api} canManage={canManage} /><SchedulePanel api={api} /></div></TabsContent>
      <TabsContent value="reflection" keepMounted><ReflectionPanel api={api} /></TabsContent>
      <TabsContent value="notifications" keepMounted>
      <ProactiveCard title="Phone notifications" description="Send phone notifications for approvals and important updates.">
        <NotificationsPanel api={api} />
      </ProactiveCard>
      </TabsContent><TabsContent value="history" keepMounted><div className="flex flex-col gap-5"><ProactiveHistory api={api} canManage={canManage} /><ProactiveCard title="Held-back alerts" description="Review alerts that your notification rules held back.">
        <HeldBack api={api} />
      </ProactiveCard></div></TabsContent></Tabs>
    </section>
  );
}
