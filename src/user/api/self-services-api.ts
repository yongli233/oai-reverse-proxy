import { Router } from "express";

import { config } from "../../config";
import { UserPartialSchema } from "../../shared/users/schema";
import * as userStore from "../../shared/users/user-store";
import { sanitizeAndTrim } from "../../shared/utils";

import { truncateToken } from "../web/self-service";

const router = Router();

router.post("/lookup", (req, res) => {
  const token = req.body.token ?? "";
  const user = structuredClone(userStore.getUser(token));

  req.log.info(
    { token: truncateToken(token), success: !!user },
    "User self-service api lookup"
  );
  if (!user) {
    return res.status(400).json({ error: "Invalid user token." });
  }

  delete user.adminNote;
  delete user.ipUsage;

  return res.json({ ...user, ip: user.ip.length });
});

router.post("/edit-nickname", (req, res) => {
  const token = req.body.token;
  const user = userStore.getUser(token);

  if (!user) {
    return res.status(400).json({ error: "Invalid user token." });
  } else if (!config.allowNicknameChanges || user.disabledAt) {
    return res.status(403).json({ error: "Nickname changes are not allowed." });
  } else if (!config.maxIpsAutoBan && !user.ip.includes(req.ip)) {
    return res.status(403).json({
      error: "Nickname changes are only allowed from registered IPs.",
    });
  }

  const schema = UserPartialSchema.pick({ nickname: true })
    .strict()
    .transform((v) => ({ nickname: sanitizeAndTrim(v.nickname) }));

  const result = schema.safeParse({ nickname: req.body.nickname });
  if (!result.success) {
    return res.status(400).json({ error: result.error.message });
  }

  const newNickname = result.data.nickname || null;
  userStore.upsertUser({ token: user.token, nickname: newNickname });

  return res.json({ message: "Nickname updated.", newNickname });
});

export { router as selfServiceAPIRouter };
