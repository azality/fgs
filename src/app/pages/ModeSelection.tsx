import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { UserCircle, Baby } from 'lucide-react';
import { motion } from 'motion/react';

export function ModeSelection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl"
      >
        <Card className="shadow-2xl border-2 border-orange-200">
          <CardHeader className="text-center pb-8 pt-12">
            <div className="text-7xl mb-6">🏡</div>
            <CardTitle className="text-4xl font-bold mb-3 bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              Welcome to Family Growth
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Choose who's logging in
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pb-12 px-8">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Parent Login */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={() => navigate('/parent/login')}
                  variant="outline"
                  className="w-full h-auto flex flex-col items-center gap-4 p-8 border-2 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UserCircle className="w-12 h-12 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-semibold mb-2 text-gray-800">Parent</h3>
                    <p className="text-sm text-gray-600">Manage family & track progress</p>
                  </div>
                </Button>
              </motion.div>

              {/* Kid Login */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={() => navigate('/kid/login')}
                  variant="outline"
                  className="w-full h-auto flex flex-col items-center gap-4 p-8 border-2 hover:border-green-400 hover:bg-green-50 transition-all group"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Baby className="w-12 h-12 text-green-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-semibold mb-2 text-gray-800">Kid</h3>
                    <p className="text-sm text-gray-600">Start your adventure!</p>
                  </div>
                </Button>
              </motion.div>
            </div>

            {/* Help text */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                First time here? Parents should sign up first, then kids can join with a PIN!
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
