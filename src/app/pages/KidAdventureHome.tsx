import { useFamilyContext } from "../contexts/FamilyContext";
import { PointsDisplay } from "../components/kid-mode/PointsDisplay";
import { TitlesBadges } from "../components/kid-mode/TitlesBadges";
import { useChallenges } from "../hooks/useChallenges";
import { useMilestones } from "../hooks/useMilestones";
import { Trophy, Map, Award, Building2, Heart, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";

/**
 * Adventure Home Screen for Kid Mode
 * Unifies all gamification elements into one narrative experience
 */
export function KidAdventureHome() {
  const { getCurrentChild, selectedChildId } = useFamilyContext();
  const currentChild = getCurrentChild();
  const { challenges, loading: challengesLoading } = useChallenges(selectedChildId || '');
  const { milestones, loading: milestonesLoading } = useMilestones();

  if (!currentChild) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-2xl text-[#2D1810] mb-4">👋 Welcome, Adventurer!</p>
          <p className="text-lg text-[#2D1810]/70">Select your profile to begin your journey!</p>
        </div>
      </div>
    );
  }

  // Find active challenges
  const activeQuests = challenges.filter(c => 
    c.status === 'available' || c.status === 'accepted'
  );
  const todayQuest = activeQuests.find(c => c.type === 'daily');

  // Calculate current level based on milestones
  const unlockedMilestones = milestones.filter(m => 
    currentChild.currentPoints >= m.points
  ).length;
  
  const nextMilestone = milestones.find(m => 
    currentChild.currentPoints < m.points
  );

  const progressToNext = nextMilestone 
    ? ((currentChild.currentPoints / nextMilestone.points) * 100)
    : 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF8E7] to-[#FFE5CC] pb-20">
      {/* Header with Points */}
      <div className="bg-gradient-to-r from-[#F4C430] to-[#FFB700] p-6 rounded-b-3xl shadow-lg mb-6">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold text-[#2D1810] mb-2">
            🌟 Welcome Back, {currentChild.name}! 🌟
          </h1>
          <p className="text-lg text-[#2D1810]/80">Ready for your next adventure?</p>
        </div>
        
        <PointsDisplay />
      </div>

      {/* Main Adventure Cards */}
      <div className="px-4 space-y-4 max-w-2xl mx-auto">
        
        {/* Today's Quest Card */}
        {todayQuest && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Link to="/challenges">
              <div className="bg-white rounded-2xl p-6 shadow-lg border-4 border-[#F4C430] hover:shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-4 rounded-xl">
                    <Trophy className="h-10 w-10 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      <span className="text-sm font-bold text-purple-600 uppercase tracking-wide">
                        Today's Quest
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-[#2D1810] mb-2">
                      {todayQuest.title}
                    </h3>
                    <p className="text-[#2D1810]/70 mb-3">
                      {todayQuest.description}
                    </p>
                    
                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[#2D1810]/70">Progress</span>
                        <span className="font-bold text-purple-600">
                          {todayQuest.currentCount}/{todayQuest.targetCount}
                        </span>
                      </div>
                      <div className="h-3 bg-purple-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-500"
                          style={{ width: `${(todayQuest.currentCount / todayQuest.targetCount) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[#F4C430]">
                      <span className="text-lg font-bold">+{todayQuest.bonusPoints} Bonus Points!</span>
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Your Journey Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Link to="/dashboard">
            <div className="bg-white rounded-2xl p-6 shadow-lg border-4 border-blue-300 hover:shadow-xl transition-all">
              <div className="flex items-start gap-4">
                <div className="bg-gradient-to-br from-blue-400 to-blue-600 p-4 rounded-xl">
                  <Map className="h-10 w-10 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#2D1810] mb-2">
                    🗺️ Your Adventure Map
                  </h3>
                  <p className="text-[#2D1810]/70 mb-3">
                    You're at level {unlockedMilestones} on your journey!
                  </p>
                  
                  {nextMilestone && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[#2D1810]/70">Next Milestone: {nextMilestone.name}</span>
                        <span className="font-bold text-blue-600">
                          {currentChild.currentPoints}/{nextMilestone.points}
                        </span>
                      </div>
                      <div className="h-3 bg-blue-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                          style={{ width: `${Math.min(progressToNext, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-blue-600 font-semibold">Tap to see your full journey →</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Your Title Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Link to="/titles-badges">
            <div className="bg-white rounded-2xl p-6 shadow-lg border-4 border-amber-300 hover:shadow-xl transition-all">
              <div className="flex items-start gap-4">
                <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-4 rounded-xl">
                  <Award className="h-10 w-10 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#2D1810] mb-2">
                    👑 Your Titles & Badges
                  </h3>
                  <p className="text-[#2D1810]/70 mb-3">
                    You've earned {unlockedMilestones} titles so far!
                  </p>
                  
                  {/* Show current title */}
                  <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-xl p-4 mb-3 border-2 border-amber-300">
                    <TitlesBadges />
                  </div>

                  <p className="text-amber-600 font-semibold">Tap to see all your achievements →</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Build the Masjid Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Link to="/dashboard">
            <div className="bg-white rounded-2xl p-6 shadow-lg border-4 border-green-300 hover:shadow-xl transition-all">
              <div className="flex items-start gap-4">
                <div className="bg-gradient-to-br from-green-400 to-green-600 p-4 rounded-xl">
                  <Building2 className="h-10 w-10 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#2D1810] mb-2">
                    🕌 Build Your Masjid
                  </h3>
                  <p className="text-[#2D1810]/70 mb-3">
                    Help build a beautiful masjid piece by piece!
                  </p>
                  
                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#2D1810]/70">Building Progress</span>
                      <span className="font-bold text-green-600">
                        {currentChild.currentPoints}/750 points
                      </span>
                    </div>
                    <div className="h-3 bg-green-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                        style={{ width: `${Math.min((currentChild.currentPoints / 750) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-green-600 font-semibold">Tap to see your masjid →</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Give Sadqa Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Link to="/sadqa">
            <div className="bg-white rounded-2xl p-6 shadow-lg border-4 border-pink-300 hover:shadow-xl transition-all">
              <div className="flex items-start gap-4">
                <div className="bg-gradient-to-br from-pink-400 to-pink-600 p-4 rounded-xl">
                  <Heart className="h-10 w-10 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#2D1810] mb-2">
                    💝 Give Sadqa (Charity)
                  </h3>
                  <p className="text-[#2D1810]/70 mb-3">
                    Share your points to help others!
                  </p>
                  
                  <div className="bg-gradient-to-r from-pink-50 to-pink-100 rounded-xl p-4 mb-3 border-2 border-pink-300">
                    <p className="text-sm text-[#2D1810]/70 mb-1">Causes you can help:</p>
                    <ul className="text-sm space-y-1">
                      <li>🍎 Feed hungry children</li>
                      <li>🌳 Plant trees</li>
                      <li>💧 Build wells</li>
                      <li>🐾 Help animals</li>
                    </ul>
                  </div>

                  <p className="text-pink-600 font-semibold">Tap to give sadqa →</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* All Quests Link */}
        {activeQuests.length > 1 && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            <Link to="/challenges">
              <div className="bg-gradient-to-r from-purple-100 to-purple-200 rounded-2xl p-4 border-2 border-purple-300 hover:bg-purple-200 transition-all text-center">
                <p className="text-lg font-bold text-purple-700">
                  ✨ See All {activeQuests.length} Active Quests
                </p>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Rewards Link */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          <Link to="/rewards">
            <div className="bg-gradient-to-r from-amber-100 to-amber-200 rounded-2xl p-4 border-2 border-amber-300 hover:bg-amber-200 transition-all text-center">
              <p className="text-lg font-bold text-amber-700">
                🎁 Browse Rewards
              </p>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Encouraging Footer Message */}
      <div className="mt-8 text-center px-4">
        <p className="text-xl text-[#2D1810] font-semibold">
          Keep going, {currentChild.name}! 🌟
        </p>
        <p className="text-[#2D1810]/70">
          Every good deed brings you closer to your goals!
        </p>
      </div>
    </div>
  );
}