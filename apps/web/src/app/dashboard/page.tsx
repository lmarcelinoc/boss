import type { Metadata } from "next";
import { EcommerceMetrics } from "@/components/ecommerce/EcommerceMetrics";
import React from "react";
import MonthlyTarget from "@/components/ecommerce/MonthlyTarget";
import MonthlySalesChart from "@/components/ecommerce/MonthlySalesChart";
import StatisticsChart from "@/components/ecommerce/StatisticsChart";
import RecentOrders from "@/components/ecommerce/RecentOrders";
import DemographicCard from "@/components/ecommerce/DemographicCard";

export const metadata: Metadata = {
  title:
    "Dashboard | TailAdmin - Next.js Dashboard Template",
  description: "This is the main Dashboard for TailAdmin Dashboard Template",
};

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7 space-y-4 sm:space-y-5 md:space-y-6">
        <EcommerceMetrics />
        <MonthlySalesChart />
      </div>

      <div className="lg:col-span-5">
        <MonthlyTarget />
      </div>

      <div className="lg:col-span-12">
        <StatisticsChart />
      </div>

      <div className="lg:col-span-5">
        <DemographicCard />
      </div>

      <div className="lg:col-span-7">
        <RecentOrders />
      </div>
    </div>
  );
}
