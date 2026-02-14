import crypto from "crypto";
import axios from "axios";

const BASE = "https://api.coindcx.com";

export function signed(endpoint, body) {
  const payload = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", process.env.COINDCX_SECRET)
    .update(payload)
    .digest("hex");

  return axios.post(BASE + endpoint, body, {
    headers: {
      "X-AUTH-APIKEY": process.env.COINDCX_KEY,
      "X-AUTH-SIGNATURE": signature
    }
  });
}

export function publicGet(endpoint) {
  return axios.get(BASE + endpoint);
}