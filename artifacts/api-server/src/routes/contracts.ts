import { Router, type IRouter } from "express";
import { ReviewContractBody, ReviewContractResponse } from "@workspace/api-zod";
import { reviewContract } from "../lib/contract-reviewer";

const router: IRouter = Router();

router.post("/review-contract", async (req, res): Promise<void> => {
  const parsed = ReviewContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = reviewContract({
    requestJson: parsed.data.requestJson,
    responseJson: parsed.data.responseJson,
    serviceName: parsed.data.serviceName ?? null,
    version: parsed.data.version ?? null,
  });

  res.json(ReviewContractResponse.parse(result));
});

export default router;
