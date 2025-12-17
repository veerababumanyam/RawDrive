import{j as e,m as p}from"./animation-vendor-C4jtCdNN.js";import{r as t,L as r}from"./react-vendor-CTAmq53R.js";import{S as f,L as b,G as g,k as j,M as w}from"./StructuredData-C6VefdNl.js";import{c as y,f as v}from"./presets-DBe4MGUi.js";import"./index-DqI6qK9D.js";import"./trending-up-DsbSOFqk.js";/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=y("ArrowLeft",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]),I=()=>{const[i,x]=t.useState(""),[a,n]=t.useState(!1),[h,l]=t.useState(!1),[o,c]=t.useState(null),u=async s=>{s.preventDefault(),c(null),n(!0);try{await new Promise(d=>setTimeout(d,1e3)),l(!0)}catch{c("Failed to send reset email. Please try again.")}finally{n(!1)}};return e.jsxs(e.Fragment,{children:[e.jsx(f,{title:"Forgot Password",description:"Reset your RawDrive account password.",canonicalUrl:"/forgot-password",noIndex:!0}),e.jsx(b,{showOrbs:!1,children:e.jsx("div",{className:"min-h-screen flex items-center justify-center px-4 py-12",children:e.jsxs(p.div,{initial:"hidden",animate:"visible",variants:v,className:"w-full max-w-md",children:[e.jsxs(r,{to:"/",className:"flex items-center justify-center gap-2 text-white mb-8",children:[e.jsx("div",{className:"w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center",children:e.jsx("span",{className:"text-white font-bold text-lg",children:"R"})}),e.jsxs("span",{className:"font-bold text-2xl tracking-tight",children:["Raw",e.jsx("span",{className:"text-gradient",children:"Drive"})]})]}),e.jsx(g,{variant:"lg",padding:"xl",children:h?e.jsxs("div",{className:"text-center",children:[e.jsx("div",{className:"w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 flex items-center justify-center",children:e.jsx(j,{size:32,className:"text-green-400"})}),e.jsx("h1",{className:"text-2xl font-bold text-white mb-2",children:"Check your email"}),e.jsxs("p",{className:"text-slate-400 mb-6",children:["We've sent a password reset link to"," ",e.jsx("span",{className:"text-white",children:i})]}),e.jsxs("p",{className:"text-sm text-slate-500 mb-6",children:["Didn't receive the email? Check your spam folder or"," ",e.jsx("button",{onClick:()=>l(!1),className:"text-primary-400 hover:text-primary-300",children:"try again"})]}),e.jsxs(r,{to:"/signin",className:`
                      inline-flex items-center justify-center gap-2
                      px-6 py-3
                      bg-white/5 hover:bg-white/10
                      border border-white/10 hover:border-white/20
                      text-white font-medium
                      rounded-xl transition-all duration-200
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                      min-h-[48px]
                    `,children:[e.jsx(m,{size:18}),"Back to Sign In"]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"text-center mb-8",children:[e.jsx("h1",{className:"text-2xl font-bold text-white mb-2",children:"Forgot your password?"}),e.jsx("p",{className:"text-slate-400",children:"No worries, we'll send you reset instructions."})]}),o&&e.jsx("div",{className:"mb-4 p-3 rounded-lg bg-error-500/10 border border-error-500/20 text-error-400 text-sm",role:"alert",children:o}),e.jsxs("form",{onSubmit:u,className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx("label",{htmlFor:"email",className:"block text-sm font-medium text-white mb-2",children:"Email"}),e.jsxs("div",{className:"relative",children:[e.jsx(w,{size:18,className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"}),e.jsx("input",{id:"email",type:"email",value:i,onChange:s=>x(s.target.value),placeholder:"you@example.com",required:!0,className:`
                            w-full pl-10 pr-4 py-3
                            bg-white/5 border border-white/10
                            rounded-xl text-white placeholder:text-slate-500
                            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                            min-h-[48px]
                          `})]})]}),e.jsx("button",{type:"submit",disabled:a,className:`
                        w-full py-3 px-4
                        flex items-center justify-center gap-2
                        bg-gradient-to-r from-primary-600 to-primary-700
                        hover:from-primary-500 hover:to-primary-600
                        text-white font-semibold
                        rounded-xl shadow-lg shadow-primary-500/25
                        transition-all duration-200
                        disabled:opacity-50 disabled:cursor-not-allowed
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                        min-h-[48px]
                      `,children:a?e.jsx("div",{className:"w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"}):"Send Reset Link"})]}),e.jsxs(r,{to:"/signin",className:`
                      mt-6 flex items-center justify-center gap-2
                      text-slate-400 hover:text-white
                      transition-colors
                    `,children:[e.jsx(m,{size:16}),"Back to Sign In"]})]})})]})})})]})};export{I as default};
//# sourceMappingURL=ForgotPasswordPage-C0fE0-ZR.js.map
