/** 17 Nov: false on PROD until SMS (and email) providers exist; set at build time. */
export function signUpOpen(): boolean {
  return process.env.NEXT_PUBLIC_SIGNUP_OPEN !== 'false';
}
