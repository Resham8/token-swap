"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowDownUp, ChevronDown, Github, GithubIcon } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";

type TokenSymbol = "SOL" | "USDC";

interface TokenConfig {
  address: string;
  decimals: number;
}

const TOKENS: Record<TokenSymbol, TokenConfig> = {
  SOL: {
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  USDC: {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
};

const JUPITER_API_BASE = "https://lite-api.jup.ag/swap/v1";
const SLIPPAGE_BPS = 50;

interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
}

export default function SwapCard() {
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState<TokenSymbol>("SOL");
  const [toToken, setToToken] = useState<TokenSymbol>("USDC");
  const [balance, setBalance] = useState(0);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const fromTokenConfig = useMemo(() => TOKENS[fromToken], [fromToken]);
  const toTokenConfig = useMemo(() => TOKENS[toToken], [toToken]);

  const exchangeRate = useMemo(() => {
    if (!currentQuote || !fromAmount || !toAmount) return null;

    const rate = Number(toAmount) / Number(fromAmount);
    return `1 ${fromToken} = ${rate.toFixed(4)} ${toToken}`;
  }, [currentQuote, fromAmount, toAmount, fromToken, toToken]);

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalance(0);
      return;
    }

    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      setBalance(0);
    }
  }, [publicKey, connection]);

  const fetchQuote = useCallback(async () => {
    if (!fromAmount || isNaN(Number(fromAmount)) || Number(fromAmount) <= 0) {
      setToAmount("");
      setCurrentQuote(null);
      return;
    }

    setIsLoadingQuote(true);
    setError(null);

    try {
      const amountInSmallestUnit = Math.floor(
        Number(fromAmount) * Math.pow(10, fromTokenConfig.decimals)
      );

      const params = new URLSearchParams({
        inputMint: fromTokenConfig.address,
        outputMint: toTokenConfig.address,
        amount: amountInSmallestUnit.toString(),
        slippageBps: SLIPPAGE_BPS.toString(),
      });

      const response = await fetch(`${JUPITER_API_BASE}/quote?${params}`);

      if (!response.ok) {
        console.error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quoteData: QuoteResponse = await response.json();
      setCurrentQuote(quoteData);

      const outputAmount =
        Number(quoteData.outAmount) / Math.pow(10, toTokenConfig.decimals);

      setToAmount(outputAmount.toFixed(6));
    } catch (err) {
      console.error("Quote fetch error:", err);
      setError("Failed to fetch quote. Please try again.");
      setToAmount("");
      setCurrentQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [fromAmount, fromTokenConfig, toTokenConfig]);

  const handleSwapTokens = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setCurrentQuote(null);
  }, [fromToken, toToken, fromAmount, toAmount]);

  const executeSwap = useCallback(async () => {
    if (!currentQuote || !publicKey || !signTransaction) {
      setError("Please connect your wallet to swap");
      return;
    }

    if (isSwapping || isLoadingQuote) return;

    const amountNum = Number(fromAmount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (amountNum > balance) {
      toast.error("Insufficient balance.");
      return;
    }

    setIsSwapping(true);
    setError(null);

    try {
      const swapResponse = await fetch(
        `${JUPITER_API_BASE}/s
        wap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quoteResponse: currentQuote,
            userPublicKey: publicKey.toString(),
            wrapAndUnwrapSol: true,
          }),
        }
      );

      if (!swapResponse.ok) {
        toast("Swap Request failed", {
          description: swapResponse.statusText,
        });
      }

      const { swapTransaction } = await swapResponse.json();

      const transactionBuffer = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      const signedTransaction = await signTransaction(transaction);

      const rawTransaction = signedTransaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        signature: txid,
      });

      toast.success("Swap successful!", {
        description: `View on Solscan: https://solscan.io/tx/${txid}`,
      });

      setFromAmount("");
      setToAmount("");
      setCurrentQuote(null);
      await fetchBalance();
    } catch (err) {
      console.error("Swap failed:", err);
      toast.error("Something went wrong during swap.");
    } finally {
      setIsSwapping(false);
    }
  }, [currentQuote, publicKey, signTransaction, connection, fetchBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [fetchQuote]);

  return (
    <div className="min-h-screen w-full bg-linear-to-br from-zinc-950 via-black to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Swap</h1>
          <WalletMultiButton />
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-zinc-800/50 p-4 space-y-1">
          <div className="bg-zinc-900/80 rounded-2xl p-4 hover:bg-zinc-900 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 font-medium">You pay</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0"
                className="bg-transparent text-4xl font-bold text-white outline-none w-full placeholder:text-zinc-800"
              />
              <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl transition-all shrink-0">
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-purple-500 to-blue-500" />
                <span className="font-semibold text-white text-sm">
                  {fromToken}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={handleSwapTokens}
              disabled={isLoadingQuote || isSwapping}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl border-4 border-zinc-900/50 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownUp className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          <div className="bg-zinc-900/80 rounded-2xl p-4 hover:bg-zinc-900 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 font-medium">
                You receive
              </span>
              <span className="text-xs text-zinc-600">
                {isLoadingQuote ? "Loading..." : ""}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={toAmount}
                placeholder="0"
                readOnly
                className="bg-transparent text-4xl font-bold text-white outline-none w-full placeholder:text-zinc-800"
              />
              <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl transition-all shrink-0">
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500 to-cyan-400" />
                <span className="font-semibold text-white text-sm">
                  {toToken}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          {exchangeRate && (
            <div className="pt-3 px-1 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Rate</span>
                <span className="text-zinc-300 font-medium">
                  {exchangeRate}
                </span>
              </div>
              {currentQuote?.priceImpactPct && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Price Impact</span>
                  <span className="text-zinc-300 font-medium">
                    {Number(currentQuote.priceImpactPct).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            className="w-full py-4 bg-white hover:bg-zinc-100 text-black font-bold text-base rounded-2xl transition-all transform hover:scale-[1.01] active:scale-[0.99] mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={executeSwap}
            disabled={
              !publicKey || !currentQuote || isSwapping || isLoadingQuote
            }
          >
            {!publicKey
              ? "Connect Wallet"
              : isSwapping
              ? "Swapping..."
              : isLoadingQuote
              ? "Loading Quote..."
              : "Swap"}
          </button>
        </div>
      </div>
      
    </div>
  );
}
