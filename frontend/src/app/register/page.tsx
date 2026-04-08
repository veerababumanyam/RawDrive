import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Register | RawDrive",
  description: "Join RawDrive India and create your account to run your photography business.",
};

export default function RegisterPage() {
  return (
    <div className="min-h-[100dvh] bg-[linear-gradient(135deg,#f9f9f9_0%,#f2f4f4_100%)] px-4 py-4 md:px-8 md:py-8">
      <main className="mx-auto grid w-full max-w-7xl overflow-hidden rounded-[1.5rem] bg-white shadow-[0_20px_40px_rgba(45,52,53,0.06)] lg:min-h-[850px] lg:grid-cols-10">
        <section className="relative hidden overflow-hidden lg:col-span-6 lg:block">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDj6kjH-QI3GOc1rJWAu5bOeoi0-vpnK0VMatssT2HbrD5bNWGyuxHSVB-TyF5MUK6lmvNLqAmc2_Vjy4myrxjBcn3-mrCmEPTBbLW0CFizGnnYkpP_osJMIWCRQWVkpTdf6FxNcc6wR-APtq1aFmpa-9eTC-tXutWPaWPlEFQvI-rGdmCG3nTh031ySE4IfKbMSfXrY-C6Ev4D7o5y9PXjTs7yd1WQXOubsSFlrSAxr8-SsDtMyM31KMLdkBrkzQxBsUMftjO_2os"
            alt="Professional Indian wedding photography"
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(45,52,53,0.08)_0%,rgba(45,52,53,0.18)_100%)] p-12 text-white backdrop-blur-[2px]">
            <div className="inline-flex w-fit flex-col gap-2 rounded-[1.5rem] bg-white/20 p-6 backdrop-blur-xl">
              <div className="font-headline text-3xl font-extrabold tracking-[-0.08em]">
                RawDrive India
              </div>
              <div className="h-px w-12 bg-white/50" />
              <p className="text-lg font-medium opacity-90">
                Your Photography Business, Elevated.
              </p>
            </div>

            <div className="max-w-md">
              <h2 className="font-headline text-4xl font-bold leading-tight">
                Store, Share, and Scale your creative vision.
              </h2>
              <p className="mt-4 leading-relaxed text-white/80">
                The only photography workflow platform designed for the vibrant Indian
                wedding industry.
              </p>
            </div>
          </div>
        </section>

        <section className="col-span-1 flex flex-col bg-white px-8 py-12 md:px-12 lg:col-span-4">
          <div className="mb-8 lg:hidden">
            <div className="font-headline text-2xl font-extrabold tracking-[-0.08em] text-[#2d3435]">
              RawDrive India
            </div>
          </div>

          <div className="mb-10">
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[#2d3435]">
              Create your account
            </h1>
            <p className="mt-2 font-medium text-[#5c6060]">
              Join 5,000+ creators scaling their craft.
            </p>
          </div>

          <RegisterForm />
        </section>
      </main>
    </div>
  );
}
