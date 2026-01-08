// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "../lib/openzeppelin-contracts/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/**
 * @title OutcomeToken
 * @author Warriors AI Arena
 * @notice ERC1155 tokens representing YES/NO outcomes in prediction markets
 * @dev Each market has two token types: YES (marketId * 2) and NO (marketId * 2 + 1)
 *
 * Token ID scheme:
 * - YES token for market N: tokenId = N * 2
 * - NO token for market N: tokenId = N * 2 + 1
 */
contract OutcomeToken is ERC1155, Ownable {
    // Errors
    error OutcomeToken__OnlyMarketContract();
    error OutcomeToken__InvalidMarketId();
    error OutcomeToken__InsufficientBalance();

    // State
    address public marketContract;
    mapping(uint256 => uint256) public totalSupply; // tokenId => total supply

    // Events
    event MarketContractUpdated(address indexed oldAddress, address indexed newAddress);
    event TokensMinted(uint256 indexed marketId, address indexed to, bool isYes, uint256 amount);
    event TokensBurned(uint256 indexed marketId, address indexed from, bool isYes, uint256 amount);

    modifier onlyMarket() {
        if (msg.sender != marketContract) {
            revert OutcomeToken__OnlyMarketContract();
        }
        _;
    }

    constructor() ERC1155("") Ownable(msg.sender) {}

    /**
     * @notice Set the market contract address
     * @param _marketContract The prediction market contract address
     */
    function setMarketContract(address _marketContract) external onlyOwner {
        address oldAddress = marketContract;
        marketContract = _marketContract;
        emit MarketContractUpdated(oldAddress, _marketContract);
    }

    /**
     * @notice Mint outcome tokens (YES or NO)
     * @param marketId The market ID
     * @param isYes Whether to mint YES tokens (true) or NO tokens (false)
     * @param amount Amount to mint
     * @param to Recipient address
     */
    function mint(
        uint256 marketId,
        bool isYes,
        uint256 amount,
        address to
    ) external onlyMarket {
        uint256 tokenId = getTokenId(marketId, isYes);
        totalSupply[tokenId] += amount;
        _mint(to, tokenId, amount, "");
        emit TokensMinted(marketId, to, isYes, amount);
    }

    /**
     * @notice Mint a complete set (1 YES + 1 NO for each unit of collateral)
     * @param marketId The market ID
     * @param amount Amount of complete sets to mint
     * @param to Recipient address
     */
    function mintCompleteSet(
        uint256 marketId,
        uint256 amount,
        address to
    ) external onlyMarket {
        uint256 yesTokenId = getTokenId(marketId, true);
        uint256 noTokenId = getTokenId(marketId, false);

        totalSupply[yesTokenId] += amount;
        totalSupply[noTokenId] += amount;

        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = yesTokenId;
        ids[1] = noTokenId;
        amounts[0] = amount;
        amounts[1] = amount;

        _mintBatch(to, ids, amounts, "");

        emit TokensMinted(marketId, to, true, amount);
        emit TokensMinted(marketId, to, false, amount);
    }

    /**
     * @notice Burn outcome tokens
     * @param marketId The market ID
     * @param isYes Whether to burn YES tokens (true) or NO tokens (false)
     * @param amount Amount to burn
     * @param from Address to burn from
     */
    function burn(
        uint256 marketId,
        bool isYes,
        uint256 amount,
        address from
    ) external onlyMarket {
        uint256 tokenId = getTokenId(marketId, isYes);

        if (balanceOf(from, tokenId) < amount) {
            revert OutcomeToken__InsufficientBalance();
        }

        totalSupply[tokenId] -= amount;
        _burn(from, tokenId, amount);
        emit TokensBurned(marketId, from, isYes, amount);
    }

    /**
     * @notice Burn a complete set (redeem collateral)
     * @param marketId The market ID
     * @param amount Amount of complete sets to burn
     * @param from Address to burn from
     */
    function burnCompleteSet(
        uint256 marketId,
        uint256 amount,
        address from
    ) external onlyMarket {
        uint256 yesTokenId = getTokenId(marketId, true);
        uint256 noTokenId = getTokenId(marketId, false);

        if (balanceOf(from, yesTokenId) < amount || balanceOf(from, noTokenId) < amount) {
            revert OutcomeToken__InsufficientBalance();
        }

        totalSupply[yesTokenId] -= amount;
        totalSupply[noTokenId] -= amount;

        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = yesTokenId;
        ids[1] = noTokenId;
        amounts[0] = amount;
        amounts[1] = amount;

        _burnBatch(from, ids, amounts);

        emit TokensBurned(marketId, from, true, amount);
        emit TokensBurned(marketId, from, false, amount);
    }

    /**
     * @notice Get the token ID for a market's outcome token
     * @param marketId The market ID
     * @param isYes Whether YES token (true) or NO token (false)
     * @return tokenId The ERC1155 token ID
     */
    function getTokenId(uint256 marketId, bool isYes) public pure returns (uint256) {
        return isYes ? marketId * 2 : marketId * 2 + 1;
    }

    /**
     * @notice Get the market ID and outcome type from a token ID
     * @param tokenId The ERC1155 token ID
     * @return marketId The market ID
     * @return isYes Whether this is a YES token
     */
    function getMarketFromTokenId(uint256 tokenId) public pure returns (uint256 marketId, bool isYes) {
        marketId = tokenId / 2;
        isYes = (tokenId % 2 == 0);
    }

    /**
     * @notice Get token balances for a market
     * @param marketId The market ID
     * @param account The account to check
     * @return yesBalance The YES token balance
     * @return noBalance The NO token balance
     */
    function getBalances(
        uint256 marketId,
        address account
    ) external view returns (uint256 yesBalance, uint256 noBalance) {
        yesBalance = balanceOf(account, getTokenId(marketId, true));
        noBalance = balanceOf(account, getTokenId(marketId, false));
    }

    /**
     * @notice Get total supply for a market's tokens
     * @param marketId The market ID
     * @return yesSupply Total YES tokens
     * @return noSupply Total NO tokens
     */
    function getSupply(
        uint256 marketId
    ) external view returns (uint256 yesSupply, uint256 noSupply) {
        yesSupply = totalSupply[getTokenId(marketId, true)];
        noSupply = totalSupply[getTokenId(marketId, false)];
    }

    /**
     * @notice URI for token metadata (can be extended for market-specific metadata)
     */
    function uri(uint256 tokenId) public pure override returns (string memory) {
        (uint256 marketId, bool isYes) = getMarketFromTokenId(tokenId);
        // Return a placeholder - in production, this would point to actual metadata
        return string(
            abi.encodePacked(
                "https://warriors-arena.0g.ai/api/token/",
                _toString(marketId),
                "/",
                isYes ? "yes" : "no"
            )
        );
    }

    /**
     * @dev Convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
