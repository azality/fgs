import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Challenge, ChallengeDifficulty } from "../data/mockData";
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { 
  Trophy, 
  Flame, 
  CheckCircle2, 
  Star, 
  Clock, 
  Target, 
  Sparkles, 
  Zap, 
  Award,
  Lock 
} from 'lucide-react';

interface ChallengeProgress {
  current: number;
  target: number;
  percentage: number;
}

export function Challenges() {
  const { getCurrentChild, children } = useFamilyContext();
  const { isParentMode, accessToken } = useAuth();
  const child = getCurrentChild();
  
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [allChildrenChallenges, setAllChildrenChallenges] = useState<{[childId: string]: Challenge[]}>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isParentMode) {
      // Load challenges for all children
      loadAllChildrenChallenges();
    } else if (child) {
      // Load challenges for selected child only (kid mode)
      loadChallenges();
    }
  }, [child, isParentMode, children]);

  const loadAllChildrenChallenges = async () => {
    if (!accessToken || !children || children.length === 0) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const challengesData: {[childId: string]: Challenge[]} = {};
      
      // Load challenges for each child
      for (const childItem of children) {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childItem.id}/challenges`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            challengesData[childItem.id] = data;
          }
        } catch (error) {
          console.error(`Load challenges error for child ${childItem.id}:`, error);
        }
      }
      
      setAllChildrenChallenges(challengesData);
    } catch (error) {
      console.error('Load all children challenges error:', error);
      toast.error("Failed to load challenges");
    } finally {
      setLoading(false);
    }
  };

  const loadChallenges = async () => {
    if (!child || !accessToken) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/challenges`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setChallenges(data);
      }
    } catch (error) {
      console.error('Load challenges error:', error);
      toast.error("Failed to load challenges");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptChallenge = async (challengeId: string) => {
    if (!accessToken) return;
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/challenges/${challengeId}/accept`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        toast.success("Challenge accepted! You've got this! 💪", {
          description: "Complete the challenge to earn bonus points!"
        });
        loadChallenges(); // Reload to update status
      }
    } catch (error) {
      console.error('Accept challenge error:', error);
      toast.error("Failed to accept challenge");
    }
  };

  if (!child && !isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to view challenges.</p>
      </div>
    );
  }

  if (isParentMode) {
    // Parent view - show overview of all children's challenges
    const allChallenges = Object.values(allChildrenChallenges).flat();
    const totalActive = allChallenges.filter(c => c.status === 'accepted').length;
    const totalCompleted = allChallenges.filter(c => c.status === 'completed').length;

    return (
      <div className="space-y-6">
        {/* Parent Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="h-10 w-10" />
              <h1 className="text-3xl sm:text-4xl font-bold">Family Challenges Overview</h1>
            </div>
            <p className="text-lg opacity-90 mb-4">
              Track your children's progress on daily and weekly challenges
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <Flame className="h-5 w-5" />
                <span className="font-semibold">{totalActive} Active Across All Kids</span>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">{totalCompleted} Completed Today</span>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
        </motion.div>

        {/* Per-Child Challenge Cards */}
        {children && children.length > 0 ? (
          <div className="space-y-6">
            {children.map((childItem) => {
              const childChallenges = allChildrenChallenges[childItem.id] || [];
              const active = childChallenges.filter(c => c.status === 'accepted');
              const completed = childChallenges.filter(c => c.status === 'completed');
              const available = childChallenges.filter(c => c.status === 'available');

              return (
                <Card key={childItem.id} className="border-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-2xl">{childItem.name}'s Challenges</CardTitle>
                        <CardDescription>
                          {active.length} active • {completed.length} completed • {available.length} available
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {active.length > 0 && (
                          <Badge className="bg-orange-500">
                            <Flame className="h-3 w-3 mr-1" />
                            {active.length} Active
                          </Badge>
                        )}
                        {completed.length > 0 && (
                          <Badge className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {completed.length} Done
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {childChallenges.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No challenges yet. New challenges appear daily!
                      </p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {/* Active Challenges First */}
                        {active.map((challenge) => (
                          <Card key={challenge.id} className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50">
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-2xl">{challenge.icon}</span>
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">{challenge.title}</p>
                                  <p className="text-xs text-muted-foreground">{challenge.description}</p>
                                </div>
                              </div>
                              <Progress value={challenge.progress.percentage} className="h-2 mb-2" />
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {challenge.progress.current}/{challenge.progress.target}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-2 w-2 mr-1" />
                                  +{challenge.bonusPoints}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        
                        {/* Completed Challenges */}
                        {completed.slice(0, 3).map((challenge) => (
                          <Card key={challenge.id} className="border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50">
                            <CardContent className="pt-4 text-center">
                              <span className="text-3xl mb-1 block">{challenge.icon}</span>
                              <p className="font-semibold text-sm">{challenge.title}</p>
                              <Badge className="mt-2 bg-green-600 text-xs">
                                <CheckCircle2 className="h-2 w-2 mr-1" />
                                Completed!
                              </Badge>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-2 border-dashed">
            <CardContent className="pt-12 pb-12 text-center">
              <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Children Yet</h3>
              <p className="text-muted-foreground">
                Add children to your family to start tracking challenges!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">About Challenges</h3>
                <p className="text-sm text-blue-800">
                  Challenges are bonus activities that kids can accept and complete for extra points. 
                  They refresh daily and weekly, encouraging consistent positive behaviors.
                  Switch to Kid Mode to let your children accept and track their own challenges!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableChallenges = challenges.filter(c => c.status === 'available');
  const activeChallengesFiltered = challenges.filter(c => c.status === 'accepted');
  const completedChallenges = challenges.filter(c => c.status === 'completed');

  const getDifficultyColor = (difficulty: ChallengeDifficulty) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'hard': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getDifficultyBadge = (difficulty: ChallengeDifficulty) => {
    const colors = {
      easy: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      hard: 'bg-red-100 text-red-700'
    };
    return colors[difficulty];
  };

  const isChildView = !isParentMode;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-10 w-10" />
            <h1 className="text-3xl sm:text-4xl font-bold">Daily Challenges!</h1>
          </div>
          <p className="text-lg opacity-90 mb-4">
            Complete challenges to earn BONUS points! 🎉
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <Flame className="h-5 w-5" />
              <span className="font-semibold">{activeChallengesFiltered.length} Active</span>
            </div>
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{completedChallenges.length} Completed</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Active Challenges */}
      {activeChallengesFiltered.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            <h2 className="text-2xl font-bold">Active Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {activeChallengesFiltered.map((challenge, index) => (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50 shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-4xl">{challenge.icon}</span>
                          <div>
                            <CardTitle className="text-xl">{challenge.title}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {challenge.description}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Progress */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Progress</span>
                          <span className="text-muted-foreground">
                            {challenge.progress.current} / {challenge.progress.target}
                          </span>
                        </div>
                        <Progress value={challenge.progress.percentage} className="h-3" />
                        <p className="text-xs text-muted-foreground">
                          {challenge.progress.percentage}% complete
                        </p>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getDifficultyBadge(challenge.difficulty)}>
                          {challenge.difficulty.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="bg-green-100 text-green-700">
                          <Star className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge variant="outline" className="bg-blue-100 text-blue-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Today' : 'This Week'}
                        </Badge>
                      </div>

                      {/* Requirements */}
                      <div className="space-y-1">
                        {challenge.requirements.map((req, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                            <span className="text-muted-foreground">{req.description}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Available Challenges */}
      {availableChallenges.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-500" />
            <h2 className="text-2xl font-bold">Available Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {availableChallenges.map((challenge, index) => (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover:shadow-lg transition-shadow border-2 border-dashed border-gray-300">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-4xl">{challenge.icon}</span>
                          <div>
                            <CardTitle className="text-xl">{challenge.title}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {challenge.description}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getDifficultyBadge(challenge.difficulty)}>
                          {challenge.difficulty.toUpperCase()}
                        </Badge>
                        <Badge className="bg-yellow-500 text-white">
                          <Sparkles className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge variant="outline" className="bg-purple-100 text-purple-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Ends Tonight' : 'Ends This Week'}
                        </Badge>
                      </div>

                      {/* Requirements */}
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Requirements:</p>
                        {challenge.requirements.map((req, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <Target className="h-4 w-4 mt-0.5 text-blue-600" />
                            <span className="text-muted-foreground">{req.description}</span>
                          </div>
                        ))}
                      </div>

                      {/* Accept Button */}
                      <Button 
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        onClick={() => handleAcceptChallenge(challenge.id)}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Accept Challenge!
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Challenges */}
      {completedChallenges.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-500" />
            <h2 className="text-2xl font-bold">Completed Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            {completedChallenges.map((challenge) => (
              <Card key={challenge.id} className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300">
                <CardContent className="pt-6 text-center">
                  <span className="text-5xl mb-2 block">{challenge.icon}</span>
                  <p className="font-semibold">{challenge.title}</p>
                  <Badge className="mt-2 bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    +{challenge.bonusPoints} Earned!
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {challenges.length === 0 && !loading && (
        <Card className="border-2 border-dashed">
          <CardContent className="pt-12 pb-12 text-center">
            <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Challenges Yet!</h3>
            <p className="text-muted-foreground">
              New challenges will appear daily. Check back soon! 🌟
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}