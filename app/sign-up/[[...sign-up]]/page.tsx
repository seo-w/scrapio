import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3 font-mono font-bold text-xl">
          S
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Únete a Scrapio</h1>
        <p className="text-slate-400 text-sm mt-1">Crea tu cuenta de acceso a la base de conocimiento</p>
      </div>

      <SignUp
        appearance={{
          elements: {
            card: "bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl",
            headerTitle: "text-white text-lg font-semibold",
            headerSubtitle: "text-slate-400 text-sm",
            socialButtonsBlockButton: "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white text-sm",
            formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors",
            formFieldLabel: "text-slate-300 text-sm font-medium",
            formFieldInput: "bg-slate-950 border-slate-700 text-white focus:border-emerald-500 focus:ring-emerald-500 rounded-lg text-sm",
            footerActionLink: "text-emerald-400 hover:text-emerald-300 font-medium",
            identityPreviewText: "text-slate-200",
            identityPreviewEditButtonIcon: "text-slate-400",
          },
        }}
      />
    </main>
  );
}
