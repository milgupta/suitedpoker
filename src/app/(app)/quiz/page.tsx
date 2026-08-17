import type { Metadata } from "next";
import { QuizClient } from "./quiz-client";

export const metadata: Metadata = { title: "Poker maths", robots: { index: false, follow: false } };

export default function QuizPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col pb-16">
      <QuizClient />
    </div>
  );
}
