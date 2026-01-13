// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IExternalMarketAgent
 * @notice Interface for AI agents that can trade on external mirrored markets
 * @dev Implemented by AIAgentINFT for external market integration
 * @custom:security-contact security@warriors.ai
 */
interface IExternalMarketAgent {
    // ============ Errors ============

    /// @notice Thrown when external trading is disabled for the agent
    error ExternalTradingDisabled();

    /// @notice Thrown when the agent is not active
    error AgentNotActive();

    /// @notice Thrown when caller is not authorized
    error NotAuthorized();

    // ============ Events ============

    /// @notice Emitted when external trading is enabled/disabled
    event ExternalTradingEnabled(
        uint256 indexed tokenId,
        bool polymarket,
        bool kalshi
    );

    /// @notice Emitted when an external trade is recorded
    event ExternalTradeRecorded(
        uint256 indexed tokenId,
        bool isPolymarket,
        string marketId,
        bool won,
        int256 pnl
    );

    // ============ Read Functions ============

    /**
     * @notice Check if an agent has external trading enabled
     * @param tokenId The agent token ID
     * @param isPolymarket True for Polymarket, false for Kalshi
     * @return enabled Whether trading is enabled for this source
     */
    function isExternalTradingEnabled(
        uint256 tokenId,
        bool isPolymarket
    ) external view returns (bool enabled);

    /**
     * @notice Get external trading statistics
     * @param tokenId The agent token ID
     * @return polymarketEnabled Polymarket trading status
     * @return kalshiEnabled Kalshi trading status
     * @return tradeCount Total external trades
     * @return pnl Total P&L from external trades
     */
    function getExternalTradingStats(uint256 tokenId) external view returns (
        bool polymarketEnabled,
        bool kalshiEnabled,
        uint256 tradeCount,
        int256 pnl
    );

    /**
     * @notice Verify agent is active and can execute trades
     * @param tokenId The agent token ID
     * @return True if agent is active
     */
    function isAgentActive(uint256 tokenId) external view returns (bool);

    /**
     * @notice Get the owner of an agent
     * @param tokenId The agent token ID
     * @return The owner address
     */
    function ownerOf(uint256 tokenId) external view returns (address);

    /**
     * @notice Get the agent's tier
     * @param tokenId The agent token ID
     * @return tier The agent tier (0=NOVICE, 1=APPRENTICE, 2=EXPERT, 3=MASTER, 4=GRANDMASTER)
     */
    function getAgentTier(uint256 tokenId) external view returns (uint8 tier);

    /**
     * @notice Get the agent's copy trading status
     * @param tokenId The agent token ID
     * @return enabled Whether copy trading is enabled
     */
    function isCopyTradingEnabled(uint256 tokenId) external view returns (bool enabled);

    // ============ Write Functions ============

    /**
     * @notice Record an external market trade
     * @dev Can only be called by authorized contracts (ExternalMarketMirror)
     * @param tokenId The agent token ID
     * @param isPolymarket True for Polymarket, false for Kalshi
     * @param marketId The external market identifier
     * @param won Whether the trade was profitable
     * @param pnl The profit/loss amount
     */
    function recordExternalTrade(
        uint256 tokenId,
        bool isPolymarket,
        string calldata marketId,
        bool won,
        int256 pnl
    ) external;

    /**
     * @notice Enable/disable external market trading for an agent
     * @dev Can only be called by the agent owner
     * @param tokenId Token ID
     * @param polymarket Whether to enable Polymarket trading
     * @param kalshi Whether to enable Kalshi trading
     */
    function enableExternalTrading(
        uint256 tokenId,
        bool polymarket,
        bool kalshi
    ) external;
}
