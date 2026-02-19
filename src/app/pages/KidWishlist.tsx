import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { useFamilyContext } from "../contexts/FamilyContext";
import { createWishlistItem, getWishlists } from "../../utils/api";
import { toast } from "sonner";
import { Mic, MicOff, Send, Sparkles, Gift, MessageSquare } from "lucide-react";

export function KidWishlist() {
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  const [wishText, setWishText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child profile.</p>
      </div>
    );
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            // Auto-stop after 60 seconds
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      toast.success("Recording started! 🎤");
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      toast.success("Recording stopped! ✅");
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    setRecordingTime(0);
    audioChunksRef.current = [];
    toast.info("Recording cleared");
  };

  const handleSubmit = async () => {
    if (!wishText && !audioBlob) {
      toast.error("Please write your wish or record an audio message!");
      return;
    }

    setSubmitting(true);

    try {
      // For now, we'll store audio as a placeholder
      // In production, you would upload to Supabase Storage
      const wishlistData: any = {
        childId: child.id,
        wishText: wishText.trim() || undefined,
        audioUrl: audioBlob ? `audio-wish-${Date.now()}.webm` : undefined,
      };

      await createWishlistItem(wishlistData);

      toast.success("Your wish has been sent to your parents! 🌟", {
        description: "They will review it soon!"
      });

      // Reset form
      setWishText("");
      setAudioBlob(null);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error submitting wishlist:', error);
      toast.error("Failed to send wish. Please try again!");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-yellow-500" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            My Wish List
          </h1>
          <Gift className="h-8 w-8 text-purple-500" />
        </div>
        <p className="text-muted-foreground">
          Tell your parents what rewards you'd like to earn! ✨
        </p>
      </div>

      {/* Main Card */}
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-pink-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-600" />
            Share Your Wish
          </CardTitle>
          <CardDescription>
            Write your wish or record an audio message (great if you can't spell yet!)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Text Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              ✏️ Write Your Wish
            </label>
            <Textarea
              placeholder="I wish for a new bike! 🚲"
              value={wishText}
              onChange={(e) => setWishText(e.target.value)}
              rows={4}
              className="text-lg resize-none border-2 focus:border-purple-400"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {wishText.length}/500 characters
            </p>
          </div>

          {/* OR Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-muted-foreground font-medium">
                OR
              </span>
            </div>
          </div>

          {/* Audio Recording */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              🎤 Record Your Wish (Audio)
            </label>
            
            <div className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-purple-300 rounded-lg bg-purple-50/30">
              {!audioBlob ? (
                <>
                  {!isRecording ? (
                    <Button
                      onClick={startRecording}
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                    >
                      <Mic className="h-5 w-5" />
                      Start Recording
                    </Button>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="animate-pulse h-4 w-4 rounded-full bg-red-500"></div>
                        <span className="text-lg font-semibold text-red-600">
                          Recording... {recordingTime}s
                        </span>
                      </div>
                      <Button
                        onClick={stopRecording}
                        size="lg"
                        variant="destructive"
                        className="gap-2"
                      >
                        <MicOff className="h-5 w-5" />
                        Stop Recording
                      </Button>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    {isRecording 
                      ? "Speak clearly and tell your parents what you wish for!"
                      : "Perfect for kids who are still learning to spell! 📣"
                    }
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-green-600 font-semibold">
                    <Mic className="h-5 w-5" />
                    Audio recorded ({recordingTime}s)
                  </div>
                  <audio 
                    src={URL.createObjectURL(audioBlob)} 
                    controls 
                    className="w-full max-w-md"
                  />
                  <Button
                    onClick={clearRecording}
                    variant="outline"
                    size="sm"
                  >
                    Clear & Record Again
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              onClick={handleSubmit}
              disabled={submitting || (!wishText && !audioBlob)}
              size="lg"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white gap-2"
            >
              <Send className="h-5 w-5" />
              {submitting ? "Sending..." : "Send My Wish to Parents! 🌟"}
            </Button>
          </div>

          {/* Helpful Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-900">💡 Tips:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Be specific about what you want</li>
              <li>If you can't spell, use the voice recorder!</li>
              <li>Your parents will see your wish and decide if they can add it</li>
              <li>Keep earning points to get your wish! ⭐</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Encouragement Card */}
      <Card className="border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-orange-50">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="text-4xl">🌟</div>
          <h3 className="font-semibold text-lg">Keep Earning Points!</h3>
          <p className="text-sm text-muted-foreground">
            The more points you earn through good behavior and habits,
            the sooner you can get your wish! Your parents will work with
            you to make it happen. ✨
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              Current Points: {child.currentPoints || 0}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
