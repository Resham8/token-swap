"use client";
import React, { useEffect, useState } from "react";
import { ArrowDownUp, ChevronDown } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import axios from "axios";

type TokenSymbol = "SOL" | "USDC";

const tokenAddress: Record<TokenSymbol, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

export default function SwapCard() {
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState<TokenSymbol>("SOL");
  const [toToken, setToToken] = useState<TokenSymbol>("USDC");
  const [balance, setBalance] = useState(0);
  const { publicKey } = useWallet();
  const wallet = useWallet();
  const { connection } = useConnection();

  const handleSwapTokens = () => {
    // Swap the tokens
    setFromToken(toToken);
    setToToken(fromToken);
    // Swap the amounts
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const getWalletBalance = async () => {
    if (wallet) {
      try {
        const lamports = await connection.getBalance(publicKey!);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (error) {
        console.log(error);
        setBalance(0);
      }
    } else {
      setBalance(0);
    }
  };

  async function getQuote() {
    const inputMint = tokenAddress[fromToken];
    const outputMint = tokenAddress[toToken];

    try {
      const amountInDecimals =
        fromToken === "SOL"
          ? Number(fromAmount) * LAMPORTS_PER_SOL
          : Number(fromAmount) * 10 ** 6;

      const response = await axios.get(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.floor(
          amountInDecimals
        )}&slippageBps=50`
      );

      const quoteResponse = response.data;
      console.log("Quote Response:", quoteResponse);

      const outAmount = quoteResponse.outAmount;

      const convertedOutAmount =
        toToken === "SOL" ? outAmount / LAMPORTS_PER_SOL : outAmount / 10 ** 6;

      setToAmount(convertedOutAmount.toFixed(6));
    } catch (err) {
      console.error("Failed to fetch quote:", err);
      setToAmount("");
    }
  }

  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchBalance = async () => {
      await getWalletBalance();
    };

    fetchBalance();
  }, [publicKey, connection]);

  useEffect(() => {
    if (!fromAmount || isNaN(Number(fromAmount)) || Number(fromAmount) <= 0) {
      return;
    }
    (async () => {
      await getQuote();
    })();
  }, [fromAmount, fromToken, toToken]);

  

  async function SwapCoin() {
    if (!fromAmount || !fromToken || !toToken) return;

    const inputMint = tokenAddress[fromToken];
    const outputMint = tokenAddress[toToken];

    const response = await axios.get(
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${fromAmount}&slippageBps=50`
    );
    const quoteResponse = response.data;
    console.log(quoteResponse);

    try {
      const {
        data: { swapTransaction },
      } = await await axios.post("https://lite-api.jup.ag/swap/v1/swap", {
        quoteResponse,
        userPublicKey: wallet.publicKey?.toString(),
      });
      console.log("swapTransaction");

      const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      console.log(transaction);

      if (!wallet.signTransaction) {
        console.error("Wallet does not support signTransaction.");
        return;
      }

      const signedTx = await wallet.signTransaction(transaction);

      const latestBlockHash = await connection.getLatestBlockhash();

      const rawTransaction = signedTx.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid,
      });
      console.log(`https://solscan.io/tx/${txid}`);
    } catch (error) {
      console.error("Swap failed:", error);
    }
  }

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
              <span className="text-xs text-zinc-600">
                Balance: {balance.toFixed(4)}
              </span>
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
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl border-4 border-zinc-900/50 transition-all hover:scale-110"
            >
              <ArrowDownUp className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          <div className="bg-zinc-900/80 rounded-2xl p-4 hover:bg-zinc-900 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 font-medium">
                You receive
              </span>
              <span className="text-xs text-zinc-600">Balance: 0.00</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
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

          {fromAmount && toAmount && (
            <div className="pt-3 px-1 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Rate</span>
                <span className="text-zinc-300 font-medium">
                  1 SOL = 150 USDC
                </span>
              </div>
            </div>
          )}

          <button
            className="w-full py-4 bg-white hover:bg-zinc-100 text-black font-bold text-base rounded-2xl transition-all transform hover:scale-[1.01] active:scale-[0.99] mt-4"
            onClick={wallet ? SwapCoin : undefined}
          >
            {wallet ? "Swap" : "Connect Wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}
