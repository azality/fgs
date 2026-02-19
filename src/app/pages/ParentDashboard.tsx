import { motion } from "motion/react";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { QuickStats } from "../components/parent-mode/QuickStats";
import { ActivityFeed } from "../components/parent-mode/ActivityFeed";
import { QuickActions } from "../components/parent-mode/QuickActions";
import { AlertCircle, TrendingUp, Users, Calendar } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "../components/ui/badge";

export function ParentDashboard() {
  const { getCurrentChild, pointEvents, editRequests, children } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const child = getCurrentChild();

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-white rounded-lg border border-gray-200">
        <div className="text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No child selected</p>
          <p className="text-sm text-gray-500 mt-1">
            Please select a child from the dropdown above
          </p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const childEvents = pointEvents.filter((e) => e.childId === child.id);
  
  const todayEvents = childEvents.filter((e) => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  });

  const todayPositive = todayEvents
    .filter((e) => e.points > 0)
    .reduce((sum, e) => sum + e.points, 0);
  
  const todayNegative = todayEvents
    .filter((e) => e.points < 0)
    .reduce((sum, e) => sum + e.points, 0);

  // Calculate 3:1 ratio
  const last30Days = childEvents.filter((e) => {
    const eventDate = new Date(e.timestamp);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return eventDate >= thirtyDaysAgo;
  });

  const positivePoints = last30Days
    .filter((e) => e.points > 0)
    .reduce((sum, e) => sum + e.points, 0);
  
  const negativePoints = Math.abs(
    last30Days
      .filter((e) => e.points < 0)
      .reduce((sum, e) => sum + e.points, 0)
  );

  const currentRatio = negativePoints > 0 ? positivePoints / negativePoints : positivePoints;

  const stats = {
    totalPoints: child.currentPoints,
    highestMilestone: child.highestMilestone || 0,
    todayPositive,
    todayNegative,
    currentRatio,
    targetRatio: 3,
  };

  // Pending edit requests
  const pendingRequests = editRequests?.filter(
    (r) => r.status === "pending" && r.childId === child.id
  ) || [];

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Command Center
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitoring {child.name}'s progress
          </p>
        </div>

        {/* Active Alerts */}
        {pendingRequests.length > 0 && (
          <Link to="/edit-requests">
            <motion.div
              whileTap={{ scale: 0.95 }}
              className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-orange-200 transition-colors"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-semibold">
                {pendingRequests.length} pending
              </span>
            </motion.div>
          </Link>
        )}
      </motion.div>

      {/* Quick Stats */}
      <QuickStats stats={stats} />

      {/* Quick Actions */}
      <QuickActions />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activity Feed - Takes 2 columns on desktop */}
        <div className="lg:col-span-2">
          <ActivityFeed 
            events={childEvents} 
            trackableItems={trackableItems}
            maxItems={15}
          />
        </div>

        {/* Side Panel - 1 column on desktop */}
        <div className="space-y-6">
          {/* Insights Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Insights</h3>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">30-Day Ratio</div>
                <div className="text-2xl font-bold text-blue-600">
                  {currentRatio.toFixed(1)}:1
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {currentRatio >= 3 ? "Healthy balance ✓" : "Needs more positives"}
                </div>
              </div>

              <div className="pt-3 border-t border-blue-200">
                <div className="text-xs text-gray-600 mb-2">Points Breakdown</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-700">Positive</span>
                    <span className="font-semibold text-green-600">
                      +{positivePoints}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-700">Negative</span>
                    <span className="font-semibold text-red-600">
                      -{negativePoints}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs pt-1.5 border-t border-blue-100">
                    <span className="font-medium text-gray-900">Net</span>
                    <span className="font-bold text-blue-600">
                      {positivePoints - negativePoints}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg border border-gray-200 p-5"
          >
            <h3 className="font-semibold text-gray-900 mb-3">Quick Links</h3>
            <div className="space-y-2">
              <Link to="/review">
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-900">Weekly Review</span>
                  </div>
                  <span className="text-xs text-gray-500">→</span>
                </div>
              </Link>

              <Link to="/audit">
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-900">Audit Trail</span>
                  </div>
                  <span className="text-xs text-gray-500">→</span>
                </div>
              </Link>

              <Link to="/settings">
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-900">Settings</span>
                  </div>
                  <span className="text-xs text-gray-500">→</span>
                </div>
              </Link>
            </div>
          </motion.div>

          {/* Family Overview */}
          {children.length > 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-lg border border-gray-200 p-5"
            >
              <h3 className="font-semibold text-gray-900 mb-3">Family</h3>
              <div className="space-y-2">
                {children.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 rounded bg-gray-50"
                  >
                    <span className="text-sm text-gray-900">{c.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {c.currentPoints} pts
                    </Badge>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
